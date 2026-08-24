import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  arrayUnion,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../firebase/firebase';

const CHAT_COLLECTION = 'chat_messages';
const CHAT_ROOMS_COLLECTION = 'chat_rooms';
const LOCAL_STORAGE_KEY = 'swu_chat_messages_v1';
const REMINDERS_STORAGE_KEY = 'swu_user_reminders_v1';

// Cross-tab / Cross-window BroadcastChannel
let chatChannel = null;
try {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    chatChannel = new BroadcastChannel('swu_realtime_chat_v10');
    chatChannel.onmessage = (event) => {
      if (event.data?.type === 'MSG_SENT' && event.data?.msg) {
        saveLocalMessage(event.data.msg);
      } else if (event.data?.type === 'CHAT_CLEARED') {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('swu_chat_updated'));
      }
    };
  }
} catch (e) {
  console.warn('BroadcastChannel setup note:', e);
}

// Global storage listener for cross-window sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_STORAGE_KEY) {
      window.dispatchEvent(new CustomEvent('swu_chat_updated'));
    }
  });
}

// Extract strict user identifiers (email, uid, id) ONLY - avoid generic fields
export function extractAllKeys(userOrId) {
  if (!userOrId) return [];

  const keys = new Set();
  const addStr = (str) => {
    if (!str) return;
    const s = String(str).trim().toLowerCase();
    if (!s) return;
    keys.add(s);
    if (s.includes('@')) {
      keys.add(s.split('@')[0]);
    }
  };

  if (typeof userOrId === 'object') {
    addStr(userOrId.email);
    addStr(userOrId.uid);
    addStr(userOrId.id);
    addStr(userOrId.senderEmail);
    addStr(userOrId.receiverEmail);
    addStr(userOrId.senderKey);
    addStr(userOrId.receiverKey);
    addStr(userOrId.userKey);
  } else {
    addStr(userOrId);
  }

  return Array.from(keys).filter(Boolean);
}

export function getCanonicalUserKey(userOrId) {
  if (!userOrId) {
    if (typeof window !== 'undefined' && auth?.currentUser?.email) {
      return String(auth.currentUser.email).trim().toLowerCase();
    }
    if (typeof window !== 'undefined' && auth?.currentUser?.uid) {
      return String(auth.currentUser.uid).trim().toLowerCase();
    }
    return '';
  }
  if (typeof userOrId === 'object') {
    if (userOrId.email) return String(userOrId.email).trim().toLowerCase();
    if (userOrId.uid || userOrId.id) return String(userOrId.uid || userOrId.id).trim().toLowerCase();
    if (typeof window !== 'undefined' && auth?.currentUser?.email) {
      return String(auth.currentUser.email).trim().toLowerCase();
    }
    return '';
  }
  return String(userOrId).trim().toLowerCase();
}

export function isSelfUser(u1, u2) {
  if (u1?.isSelf || u2?.isSelf) return true;
  
  const k1 = getCanonicalUserKey(u1);
  const k2 = getCanonicalUserKey(u2);
  if (k1 && k2 && k1 === k2) return true;

  const em1 = u1?.email ? String(u1.email).trim().toLowerCase() : '';
  const em2 = u2?.email ? String(u2.email).trim().toLowerCase() : '';
  if (em1 && em2 && em1 === em2) return true;

  const uid1 = String(u1?.uid || u1?.id || '').trim().toLowerCase();
  const uid2 = String(u2?.uid || u2?.id || '').trim().toLowerCase();
  if (uid1 && uid2 && uid1 === uid2) return true;

  return false;
}

// Generate primary conversation ID and all possible room variant IDs
export function getConversationId(user1, user2) {
  const k1 = getCanonicalUserKey(user1);
  const k2 = getCanonicalUserKey(user2);
  if (!k1 || !k2) return '';
  if (isSelfUser(user1, user2)) return `${k1}_self`;
  return [k1, k2].sort().join('__');
}

export function getAllPossibleRoomIds(user1, user2) {
  if (!user1 || !user2) return [];
  if (isSelfUser(user1, user2)) {
    const k = getCanonicalUserKey(user1);
    return [`${k}_self`].filter(Boolean);
  }

  const ids = new Set();

  const primaryCId = getConversationId(user1, user2);
  if (primaryCId) ids.add(primaryCId);

  const keys1 = extractAllKeys(user1);
  const keys2 = extractAllKeys(user2);

  // Generate pair IDs between all valid key combinations
  keys1.forEach((k1) => {
    keys2.forEach((k2) => {
      if (k1 && k2 && k1 !== k2) {
        ids.add([k1, k2].sort().join('__'));
      }
    });
  });

  return Array.from(ids).filter(Boolean);
}

export function getLocalMessages() {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

export function saveLocalMessage(msg) {
  try {
    const list = getLocalMessages();
    const idx = list.findIndex(
      (m) =>
        m.id === msg.id ||
        (m.timestamp === msg.timestamp &&
          String(m.senderKey || m.senderEmail).toLowerCase() === String(msg.senderKey || msg.senderEmail).toLowerCase() &&
          m.text === msg.text)
    );

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...msg };
    } else {
      list.push(msg);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('swu_chat_updated'));
  } catch (e) {
    console.warn('Error saving local message:', e);
  }
}

export function isMessageInConversation(msg, u1, u2) {
  if (!msg || !u1 || !u2) return false;

  const keys1 = extractAllKeys(u1);
  const keys2 = extractAllKeys(u2);

  const sKeys = extractAllKeys({
    email: msg.senderEmail,
    uid: msg.senderUid,
    id: msg.senderKey,
    key: msg.senderKey,
  });

  const rKeys = extractAllKeys({
    email: msg.receiverEmail,
    uid: msg.receiverUid,
    id: msg.receiverKey,
    key: msg.receiverKey,
  });

  if (isSelfUser(u1, u2)) {
    return sKeys.some((sk) => keys1.includes(sk)) && rKeys.some((rk) => keys1.includes(rk));
  }

  // Direct Key Match: Sender matches User1 AND Receiver matches User2
  const sIs1 = sKeys.some((sk) => keys1.includes(sk));
  const rIs2 = rKeys.some((rk) => keys2.includes(rk));

  // Direct Key Match: Sender matches User2 AND Receiver matches User1
  const sIs2 = sKeys.some((sk) => keys2.includes(sk));
  const rIs1 = rKeys.some((rk) => keys1.includes(rk));

  if ((sIs1 && rIs2) || (sIs2 && rIs1)) return true;

  // Room ID Match
  const possibleRoomIds = getAllPossibleRoomIds(u1, u2);
  if (msg.conversationId && possibleRoomIds.includes(msg.conversationId)) {
    return true;
  }

  // Participants Array Match
  if (msg.participants && Array.isArray(msg.participants)) {
    const parts = msg.participants.map((p) => String(p || '').trim().toLowerCase());
    const m1 = keys1.some((k) => parts.includes(k));
    const m2 = keys2.some((k) => parts.includes(k));
    if (m1 && m2) return true;
  }

  return false;
}

export async function sendMessage({
  sender,
  receiver,
  senderUid,
  receiverUid,
  senderEmail,
  receiverEmail,
  senderName,
  text,
  replyTo,
  categoryTag,
  noteDate,
  colorTheme,
}) {
  const sUser = sender || { uid: senderUid, email: senderEmail };
  const rUser = receiver || { uid: receiverUid, email: receiverEmail };

  const sKey = getCanonicalUserKey(sUser);
  const rKey = getCanonicalUserKey(rUser);

  if (!sKey || !rKey || !text?.trim()) return;

  const conversationId = getConversationId(sUser, rUser);
  const possibleRoomIds = getAllPossibleRoomIds(sUser, rUser);
  const now = Date.now();
  const localId = `msg_${now}_${Math.random().toString(36).substring(2, 7)}`;

  const sKeys = extractAllKeys(sUser);
  const rKeys = extractAllKeys(rUser);

  const allParticipants = [
    ...sKeys,
    ...rKeys,
    sKey,
    rKey,
  ];

  const defaultDateStr = new Date().toISOString().split('T')[0];

  // Clean JSON-serializable primitives for Firestore compatibility
  const msgObj = {
    id: String(localId),
    conversationId: String(conversationId),
    senderKey: String(sKey),
    receiverKey: String(rKey),
    senderUid: String(sUser.uid || sUser.id || sKey),
    receiverUid: String(rUser.uid || rUser.id || rKey),
    senderEmail: String(sUser.email || sKey),
    receiverEmail: String(rUser.email || rKey),
    senderName: String(senderName || sUser.name || 'User'),
    participants: [...new Set(allParticipants)].map((p) => String(p || '')),
    text: String(text).trim(),
    categoryTag: categoryTag ? String(categoryTag) : '',
    noteDate: String(noteDate || defaultDateStr),
    colorTheme: String(colorTheme || 'amber'),
    pinned: false,
    completed: false,
    replyTo: replyTo
      ? {
          id: String(replyTo.id || ''),
          text: String(replyTo.text || ''),
          senderName: String(replyTo.senderName || 'User'),
        }
      : null,
    read: false,
    timestamp: Number(now),
  };

  // 1. Save to Local Storage immediately
  saveLocalMessage(msgObj);

  // 2. Broadcast cross-tab immediately
  if (chatChannel) {
    try {
      chatChannel.postMessage({ type: 'MSG_SENT', msg: msgObj });
    } catch (e) {
      console.warn('Broadcast error:', e);
    }
  }

  // 3. Save to Firestore collection `chat_messages`
  try {
    const msgRef = doc(db, CHAT_COLLECTION, localId);
    await setDoc(msgRef, {
      ...msgObj,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Collection save note:', error);
  }

  // 4. Save to Firestore room documents (primary + all possible room variant IDs)
  try {
    const roomPromises = possibleRoomIds.map((roomId) => {
      const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
      return setDoc(
        roomRef,
        {
          conversationId: roomId,
          participants: [...new Set(allParticipants)],
          messages: arrayUnion(msgObj),
          lastMessage: msgObj,
          updatedAt: now,
        },
        { merge: true }
      );
    });
    await Promise.all(roomPromises);
  } catch (e) {
    console.warn('Room doc save note:', e);
  }
}

export async function togglePinMessage({ user1, user2, messageId }) {
  if (!messageId) return;
  const roomIds = getAllPossibleRoomIds(user1, user2);

  try {
    const list = getLocalMessages();
    let updated = false;
    list.forEach((m) => {
      if (m.id === messageId) {
        m.pinned = !m.pinned;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('swu_chat_updated'));
    }
  } catch (e) {
    console.warn('Error toggling pin local:', e);
  }

  try {
    const msgRef = doc(db, CHAT_COLLECTION, messageId);
    const snap = await getDoc(msgRef);
    if (snap.exists()) {
      await setDoc(msgRef, { pinned: !snap.data().pinned }, { merge: true });
    }
  } catch (e) {
    console.warn('Collection pin note:', e);
  }

  try {
    const roomPromises = roomIds.map(async (roomId) => {
      const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const data = roomSnap.data();
        const msgs = (data.messages || []).map((m) => {
          if (m.id === messageId) {
            return { ...m, pinned: !m.pinned };
          }
          return m;
        });
        await setDoc(roomRef, { messages: msgs }, { merge: true });
      }
    });
    await Promise.all(roomPromises);
  } catch (e) {
    console.warn('Room pin note:', e);
  }
}

export async function toggleCompleteMessage({ user1, user2, messageId }) {
  if (!messageId) return;
  const roomIds = getAllPossibleRoomIds(user1, user2);

  try {
    const list = getLocalMessages();
    let updated = false;
    list.forEach((m) => {
      if (m.id === messageId) {
        m.completed = !m.completed;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('swu_chat_updated'));
    }
  } catch (e) {
    console.warn('Error toggling complete local:', e);
  }

  try {
    const msgRef = doc(db, CHAT_COLLECTION, messageId);
    const snap = await getDoc(msgRef);
    if (snap.exists()) {
      await setDoc(msgRef, { completed: !snap.data().completed }, { merge: true });
    }
  } catch (e) {
    console.warn('Collection complete note:', e);
  }

  try {
    const roomPromises = roomIds.map(async (roomId) => {
      const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const data = roomSnap.data();
        const msgs = (data.messages || []).map((m) => {
          if (m.id === messageId) {
            return { ...m, completed: !m.completed };
          }
          return m;
        });
        await setDoc(roomRef, { messages: msgs }, { merge: true });
      }
    });
    await Promise.all(roomPromises);
  } catch (e) {
    console.warn('Room complete note:', e);
  }
}

export async function editNoteDetails({ user1, user2, messageId, newText, noteDate, colorTheme }) {
  if (!messageId) return;

  const roomIds = getAllPossibleRoomIds(user1, user2);
  const updates = { edited: true };
  if (newText !== undefined && newText.trim()) updates.text = newText.trim();
  if (noteDate !== undefined) updates.noteDate = noteDate;
  if (colorTheme !== undefined) updates.colorTheme = colorTheme;

  try {
    const list = getLocalMessages();
    let updated = false;
    list.forEach((m) => {
      if (m.id === messageId) {
        Object.assign(m, updates);
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('swu_chat_updated'));
    }
  } catch (e) {
    console.warn('Error editing local note details:', e);
  }

  try {
    const msgRef = doc(db, CHAT_COLLECTION, messageId);
    await setDoc(msgRef, updates, { merge: true });
  } catch (e) {
    console.warn('Collection edit note details:', e);
  }

  try {
    const roomPromises = roomIds.map(async (roomId) => {
      const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const data = roomSnap.data();
        const msgs = (data.messages || []).map((m) => {
          if (m.id === messageId) {
            return { ...m, ...updates };
          }
          return m;
        });
        await setDoc(roomRef, { messages: msgs }, { merge: true });
      }
    });
    await Promise.all(roomPromises);
  } catch (e) {
    console.warn('Room edit note details:', e);
  }
}

export async function editMessage({ user1, user2, messageId, newText }) {
  return editNoteDetails({ user1, user2, messageId, newText });
}

export async function deleteMessage({ user1, user2, messageId }) {
  if (!messageId) return;

  const roomIds = getAllPossibleRoomIds(user1, user2);

  try {
    const list = getLocalMessages();
    const filtered = list.filter((m) => m.id !== messageId);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('swu_chat_updated'));
  } catch (e) {
    console.warn('Error deleting local message:', e);
  }

  try {
    const msgRef = doc(db, CHAT_COLLECTION, messageId);
    await deleteDoc(msgRef);
  } catch (e) {
    console.warn('Collection delete note:', e);
  }

  try {
    const roomPromises = roomIds.map(async (roomId) => {
      const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const data = roomSnap.data();
        const msgs = (data.messages || []).filter((m) => m.id !== messageId);
        await setDoc(roomRef, { messages: msgs }, { merge: true });
      }
    });
    await Promise.all(roomPromises);
  } catch (e) {
    console.warn('Room delete note:', e);
  }
}

export async function clearConversationHistory(user1, user2) {
  if (!user1 || !user2) return;
  const roomIds = getAllPossibleRoomIds(user1, user2);

  try {
    const list = getLocalMessages();
    const filtered = list.filter((m) => !isMessageInConversation(m, user1, user2));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('swu_chat_updated'));
  } catch (e) {
    console.warn('Error clearing local conversation:', e);
  }

  if (chatChannel) {
    try {
      chatChannel.postMessage({ type: 'CHAT_CLEARED' });
    } catch (e) {
      console.warn('Broadcast error:', e);
    }
  }

  try {
    const roomPromises = roomIds.map(async (roomId) => {
      const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
      await setDoc(roomRef, { conversationId: roomId, messages: [], lastMessage: null, updatedAt: Date.now() }, { merge: true });
    });
    await Promise.all(roomPromises);
  } catch (e) {
    console.warn('Room clear note:', e);
  }

  try {
    const primaryCId = getConversationId(user1, user2);
    if (primaryCId) {
      const snap = await getDocs(query(collection(db, CHAT_COLLECTION), where('conversationId', '==', primaryCId)));
      const deletePromises = snap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deletePromises);
    }
  } catch (e) {
    console.warn('Collection clear note:', e);
  }

  window.dispatchEvent(new CustomEvent('swu_chat_updated'));
}

export async function clearAllChatHistory() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('swu_chat_updated'));

    const roomSnap = await getDocs(collection(db, CHAT_ROOMS_COLLECTION));
    const roomPromises = roomSnap.docs.map((d) =>
      setDoc(d.ref, { messages: [], lastMessage: null, updatedAt: Date.now() }, { merge: true })
    );
    await Promise.all(roomPromises);

    const msgSnap = await getDocs(collection(db, CHAT_COLLECTION));
    const msgPromises = msgSnap.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(msgPromises);

    if (chatChannel) {
      chatChannel.postMessage({ type: 'CHAT_CLEARED' });
    }
  } catch (e) {
    console.warn('Error clearing chat history:', e);
  }
}

// Subscribe to ALL possible room document variant IDs simultaneously
export function subscribeConversationMessages(user1, user2, callback) {
  if (!user1 || !user2) return () => {};

  const possibleRoomIds = getAllPossibleRoomIds(user1, user2);

  const roomMsgsMap = new Map();
  let colMsgs = [];

  const emitMerged = () => {
    const local = getLocalMessages().filter((m) => isMessageInConversation(m, user1, user2));

    const combinedMap = new Map();

    // 1. Add local messages
    local.forEach((m) => {
      const key = m.id || `${m.timestamp}_${m.senderKey || m.senderUid}_${m.text}`;
      combinedMap.set(key, m);
    });

    // 2. Add room messages from all subscribed variant rooms
    roomMsgsMap.forEach((msgs) => {
      (msgs || []).forEach((m) => {
        if (isMessageInConversation(m, user1, user2)) {
          const key = m.id || `${m.timestamp}_${m.senderKey || m.senderUid}_${m.text}`;
          combinedMap.set(key, m);
        }
      });
    });

    // 3. Add collection messages
    colMsgs.forEach((m) => {
      if (isMessageInConversation(m, user1, user2)) {
        const key = m.id || `${m.timestamp}_${m.senderKey || m.senderUid}_${m.text}`;
        combinedMap.set(key, m);
      }
    });

    const sorted = Array.from(combinedMap.values()).sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (a.timestamp || 0) - (b.timestamp || 0);
    });

    callback(sorted);
  };

  const handleStorageUpdate = () => emitMerged();
  window.addEventListener('swu_chat_updated', handleStorageUpdate);

  emitMerged();

  // Subscribe to ALL variant room document IDs
  const unsubRooms = possibleRoomIds.map((roomId) => {
    const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
    return onSnapshot(
      roomRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          roomMsgsMap.set(roomId, data.messages || []);
        } else {
          roomMsgsMap.delete(roomId);
        }
        emitMerged();
      },
      (err) => {
        console.warn(`Room listener note [${roomId}]:`, err);
        emitMerged();
      }
    );
  });

  // Also listen to chat_messages collection
  const qCol = query(collection(db, CHAT_COLLECTION));
  const unsubCol = onSnapshot(
    qCol,
    (snapshot) => {
      colMsgs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      emitMerged();
    },
    (err) => {
      console.warn('Collection listener note:', err);
      emitMerged();
    }
  );

  return () => {
    window.removeEventListener('swu_chat_updated', handleStorageUpdate);
    unsubRooms.forEach((unsub) => unsub());
    unsubCol();
  };
}

export function subscribeAllUserChats(userObj, callback) {
  if (!userObj) return () => {};

  const keys = extractAllKeys(userObj);
  let colMsgs = [];
  let roomMsgs = [];

  const isUserMsg = (m) => {
    if (!m) return false;
    const sKeys = extractAllKeys({
      email: m.senderEmail,
      uid: m.senderUid,
      id: m.senderKey,
      key: m.senderKey,
    });
    const rKeys = extractAllKeys({
      email: m.receiverEmail,
      uid: m.receiverUid,
      id: m.receiverKey,
      key: m.receiverKey,
    });

    const isParticipant = keys.some((k) => sKeys.includes(k) || rKeys.includes(k));
    if (isParticipant) return true;

    if (Array.isArray(m.participants)) {
      const parts = m.participants.map((p) => String(p || '').toLowerCase());
      return keys.some((k) => parts.includes(k));
    }
    return false;
  };

  const emitMerged = () => {
    const local = getLocalMessages().filter(isUserMsg);
    const combinedMap = new Map();
    [...local, ...colMsgs, ...roomMsgs].forEach((m) => {
      if (isUserMsg(m)) {
        const key = m.id || `${m.timestamp}_${m.senderKey || m.senderUid}_${m.text}`;
        combinedMap.set(key, m);
      }
    });
    callback(Array.from(combinedMap.values()));
  };

  const handleStorageUpdate = () => emitMerged();
  window.addEventListener('swu_chat_updated', handleStorageUpdate);

  emitMerged();

  const qCol = query(collection(db, CHAT_COLLECTION));
  const unsubCol = onSnapshot(
    qCol,
    (snapshot) => {
      colMsgs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      emitMerged();
    },
    (err) => {
      console.warn('Collection listener note:', err);
      emitMerged();
    }
  );

  const qRooms = query(collection(db, CHAT_ROOMS_COLLECTION));
  const unsubRooms = onSnapshot(
    qRooms,
    (snapshot) => {
      let extracted = [];
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        if (Array.isArray(data.messages)) {
          extracted.push(...data.messages);
        }
      });
      roomMsgs = extracted;
      emitMerged();
    },
    (err) => {
      console.warn('Rooms listener note:', err);
      emitMerged();
    }
  );

  return () => {
    window.removeEventListener('swu_chat_updated', handleStorageUpdate);
    unsubCol();
    unsubRooms();
  };
}

export async function markConversationAsRead(user1, user2) {
  if (!user1 || !user2) return;

  const possibleRoomIds = getAllPossibleRoomIds(user1, user2);
  const keys1 = extractAllKeys(user1);

  try {
    const list = getLocalMessages();
    let updated = false;
    list.forEach((m) => {
      if (
        isMessageInConversation(m, user1, user2) &&
        keys1.some((k) => k === String(m.receiverKey || m.receiverEmail || m.receiverUid || '').toLowerCase()) &&
        !m.read
      ) {
        m.read = true;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('swu_chat_updated'));
    }
  } catch (e) {
    console.warn('Error marking local chat as read:', e);
  }

  try {
    const roomPromises = possibleRoomIds.map(async (roomId) => {
      const roomRef = doc(db, CHAT_ROOMS_COLLECTION, roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const data = roomSnap.data();
        const msgs = (data.messages || []).map((m) => {
          if (keys1.some((k) => k === String(m.receiverKey || m.receiverEmail || m.receiverUid || '').toLowerCase())) {
            return { ...m, read: true };
          }
          return m;
        });
        await setDoc(roomRef, { messages: msgs }, { merge: true });
      }
    });
    await Promise.all(roomPromises);
  } catch (e) {
    console.warn('Room mark read note:', e);
  }
}

// ----------------------------------------------------
// Personal User Reminders Helpers
// ----------------------------------------------------

export function getLocalReminders(userKey) {
  try {
    const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
    const all = saved ? JSON.parse(saved) : [];
    if (!userKey) return all;
    const key = String(userKey).toLowerCase();
    return all.filter((r) => String(r.userKey).toLowerCase() === key);
  } catch {
    return [];
  }
}

export function saveReminder(userKey, { title, date, time, priority, tag }) {
  if (!title?.trim() || !userKey) return null;

  try {
    const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
    const all = saved ? JSON.parse(saved) : [];
    const newRem = {
      id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userKey: String(userKey).toLowerCase(),
      title: title.trim(),
      date: date || new Date().toISOString().split('T')[0],
      time: time || '09:00',
      priority: priority || 'Medium',
      tag: tag || 'General',
      completed: false,
      createdAt: Date.now(),
    };
    all.unshift(newRem);
    localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new CustomEvent('swu_reminders_updated'));
    return newRem;
  } catch (e) {
    console.warn('Error saving reminder:', e);
    return null;
  }
}

export function updateReminder(reminderId, { title, date, time, priority }) {
  try {
    const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
    const all = saved ? JSON.parse(saved) : [];
    let updated = false;
    all.forEach((r) => {
      if (r.id === reminderId) {
        if (title !== undefined) r.title = title.trim();
        if (date !== undefined) r.date = date;
        if (time !== undefined) r.time = time;
        if (priority !== undefined) r.priority = priority;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent('swu_reminders_updated'));
    }
  } catch (e) {
    console.warn('Error updating reminder:', e);
  }
}

export function toggleReminderCompleted(reminderId) {
  try {
    const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
    const all = saved ? JSON.parse(saved) : [];
    let updated = false;
    all.forEach((r) => {
      if (r.id === reminderId) {
        r.completed = !r.completed;
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(all));
      window.dispatchEvent(new CustomEvent('swu_reminders_updated'));
    }
  } catch (e) {
    console.warn('Error toggling reminder:', e);
  }
}

export function deleteReminder(reminderId) {
  try {
    const saved = localStorage.getItem(REMINDERS_STORAGE_KEY);
    const all = saved ? JSON.parse(saved) : [];
    const filtered = all.filter((r) => r.id !== reminderId);
    localStorage.setItem(REMINDERS_STORAGE_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('swu_reminders_updated'));
  } catch (e) {
    console.warn('Error deleting reminder:', e);
  }
}

export async function purgeUserChatData(uid, userEmail) {
  if (!uid && !userEmail) return;

  const targetKeys = [
    uid,
    userEmail,
    userEmail ? userEmail.split('@')[0] : '',
  ].filter(Boolean).map((k) => String(k).trim().toLowerCase());

  // 1. Purge LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const msgs = JSON.parse(raw);
        if (Array.isArray(msgs)) {
          const remaining = msgs.filter((m) => {
            const sKey = String(m.senderEmail || m.senderUid || m.senderKey || '').toLowerCase();
            const rKey = String(m.receiverEmail || m.receiverUid || m.receiverKey || '').toLowerCase();
            const parts = Array.isArray(m.participants) ? m.participants.map((p) => String(p).toLowerCase()) : [];
            return !targetKeys.some((k) => sKey === k || rKey === k || parts.includes(k));
          });
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining));
          window.dispatchEvent(new CustomEvent('swu_chat_updated'));
        }
      }
    } catch (e) {
      console.warn('LocalStorage chat purge note:', e);
    }
  }

  // 2. Purge Firestore chat_rooms documents
  try {
    const roomsSnap = await getDocs(collection(db, CHAT_ROOMS_COLLECTION));
    for (const rDoc of roomsSnap.docs) {
      const rId = rDoc.id.toLowerCase();
      const data = rDoc.data() || {};
      const idMatch = targetKeys.some((k) => rId.includes(k));
      const partsMatch = Array.isArray(data.participants) && data.participants.some((p) => targetKeys.includes(String(p).toLowerCase()));

      if (idMatch || partsMatch) {
        await deleteDoc(rDoc.ref);
      } else if (Array.isArray(data.messages)) {
        const filtered = data.messages.filter((m) => {
          const sKey = String(m.senderEmail || m.senderUid || m.senderKey || '').toLowerCase();
          const rKey = String(m.receiverEmail || m.receiverUid || m.receiverKey || '').toLowerCase();
          return !targetKeys.includes(sKey) && !targetKeys.includes(rKey);
        });
        if (filtered.length !== data.messages.length) {
          if (filtered.length === 0) {
            await deleteDoc(rDoc.ref);
          } else {
            const lastMsg = filtered[filtered.length - 1] || null;
            await setDoc(rDoc.ref, { messages: filtered, lastMessage: lastMsg }, { merge: true });
          }
        }
      }
    }
  } catch (e) {
    console.warn('chat_rooms purge note:', e);
  }

  // 3. Purge Firestore chat_messages collection
  try {
    const msgSnap = await getDocs(collection(db, CHAT_COLLECTION));
    for (const d of msgSnap.docs) {
      const m = d.data() || {};
      const sKey = String(m.senderEmail || m.senderUid || m.senderKey || '').toLowerCase();
      const rKey = String(m.receiverEmail || m.receiverUid || m.receiverKey || '').toLowerCase();
      const parts = Array.isArray(m.participants) ? m.participants.map((p) => String(p).toLowerCase()) : [];
      if (targetKeys.some((k) => sKey === k || rKey === k || parts.includes(k))) {
        await deleteDoc(d.ref);
      }
    }
  } catch (e) {
    console.warn('chat_messages purge note:', e);
  }

  if (chatChannel) {
    chatChannel.postMessage({ type: 'CHAT_CLEARED' });
  }
}

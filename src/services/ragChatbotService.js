/**
 * RAG (Retrieval-Augmented Generation) Chatbot Service
 * SWU-IFSS Intelligent Facility & Scheduling Assistant (COBRA)
 * 
 * Features:
 * - Anti-hallucination system boundary constraints
 * - Real-time Firestore room & reservation data ingestion
 * - Intelligent room recommendation with actionable room metadata tags
 * - Multi-model Gemini fallback (gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash)
 */

import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';
import { COLLEGE_ACRONYM_MAP } from '../constants/colleges';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

// Primary & Fallback Gemini Model Endpoints (using gemini-3.6-flash matching calendarAiService)
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

// In-memory cache for ultra-fast queries
let cachedRooms = null;
let cachedReservations = null;
let cachedBuildings = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * System Knowledge Base: Permanent Facts about SWU-IFSS
 */
const SYSTEM_KNOWLEDGE_BASE = `
SYSTEM OVERVIEW:
Southwestern University PHINMA - Integrated Facility Scheduling System (SWU-IFSS).
SWU-IFSS is the centralized platform for managing campus room reservations, weekly course schedules, building/room inventory, academic calendars, and facility maintenance.

USER ROLES & PERMISSIONS:
- Registrar: University super-administrator. Final approval for room reservations, course schedules, academic calendar setup, and user account creation.
- Dean: Academic leader for a specific college. Plots regular and exam course schedules for college sections, assigns rooms and faculty, and approves academic activity permits.
- Teacher / Faculty: Views class schedules, assigned teaching rooms, and academic calendar dates.
- Organization Head: Submits room reservation requests and on-campus activity permits for student organizations.
- General Services Department (GSD): Manages campus maintenance, equipment logistics, facility inspections, and endorses venue usage.
- Student Life Office (SLO): Reviews student organization activity permits and non-academic room reservations before Dean/Registrar routing.
- Property & Facilities Office: Tracks building and room assets, equipment inventory, and physical spaces.
- VP Academics & Chancellor: Executive oversight of university academic operations.

ROOM RESERVATION & ACTIVITY PERMIT POLICIES:
- Minimum Advance Notice: Room reservations and On-Campus Activity Permits must be submitted at least 7 DAYS in advance.
- Approval Workflow Routing:
  1. Academic Activity: Requestor -> College Dean -> GSD (if facilities/equipment needed) -> Registrar (Final Approval).
  2. Non-Academic Activity: Requestor -> Student Life Office -> College Head / Org Adviser -> GSD -> Registrar.
- Priority: Academic classes and scheduled university exams take precedence over non-academic room bookings.

COURSE SCHEDULING WORKFLOW:
- Regular weekly scheduling: Deans plot course lecture and laboratory blocks across Monday to Saturday into vacant rooms without double-booking.
- Exam periods (P1, P2, P3): Exam schedules follow academic calendar bounds for Freshmen and Upperclassmen.
- Self-conflict prevention: The system automatically blocks room and section time overlaps.

COLLEGES & ACADEMIC PROGRAMS AT SWU PHINMA:
- College of Medical Technology (BSMT / MLS)
- College of Nursing (BSN)
- College of Medicine (MED)
- College of Dentistry (DMD)
- College of Pharmacy (PHARMA)
- College of Optometry (OPTOM)
- College of Physical Therapy (PT / BSPT)
- College of Radiologic Technology (RADTECH / BSRT)
- College of Arts and Sciences (CAS)
- College of Information Technology & Computer Studies (BSIT / CS)
- College of Business Administration (CBA / BSBA)
- School of Engineering and Architecture (SEA)
- College of Education (EDUC)
- College of Criminology (CRIM)
- College of Law (LAW)
- School of Health and Allied Health Sciences (SHAHS / Senior High)
`;

/**
 * Fetch all buildings, floors, and rooms from Firestore
 */
export async function fetchAllRoomsFlat(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedRooms && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRooms;
  }

  try {
    const buildingsSnapshot = await getDocs(collection(db, COLLECTIONS.BUILDINGS));
    const buildingsList = [];

    const buildingPromises = buildingsSnapshot.docs.map(async (buildingDoc) => {
      const buildingData = buildingDoc.data();
      const bObj = {
        id: buildingDoc.id,
        name: buildingData.name || 'Building',
        code: buildingData.code || buildingData.prefix || '',
      };
      buildingsList.push(bObj);

      const floorsSnapshot = await getDocs(
        collection(db, COLLECTIONS.BUILDINGS, buildingDoc.id, COLLECTIONS.FLOORS)
      );

      const floorPromises = floorsSnapshot.docs.map(async (floorDoc) => {
        const floorData = floorDoc.data();
        const floorNumber = floorData.floorNumber || floorData.floor || 1;
        const floorLabel = floorData.label || `Floor ${floorNumber}`;

        const roomsSnapshot = await getDocs(
          collection(db, COLLECTIONS.BUILDINGS, buildingDoc.id, COLLECTIONS.FLOORS, floorDoc.id, COLLECTIONS.ROOMS)
        );

        return roomsSnapshot.docs.map((roomDoc) => {
          const roomData = roomDoc.data();
          const roomCode = roomData.roomCode || roomData.name || roomDoc.id;
          const capacity = Number(roomData.capacity) || 40;
          const type = roomData.type || 'Classroom';
          const equipment = Array.isArray(roomData.equipment) ? roomData.equipment : [];
          const status = roomData.status || roomData.maintenanceStatus || 'Available';

          return {
            id: roomDoc.id,
            roomCode,
            name: roomCode,
            buildingId: buildingDoc.id,
            buildingName: buildingData.name || 'Main Building',
            buildingCode: buildingData.code || '',
            floor: floorNumber,
            floorLabel,
            floorId: floorDoc.id,
            type,
            capacity,
            equipment,
            status,
            maintenanceStatus: roomData.maintenanceStatus || 'operational',
          };
        });
      });

      const floorRooms = await Promise.all(floorPromises);
      return floorRooms.flat();
    });

    const allRoomsNested = await Promise.all(buildingPromises);
    const flattened = allRoomsNested.flat();

    cachedRooms = flattened;
    cachedBuildings = buildingsList;
    cacheTimestamp = Date.now();
    return flattened;
  } catch (err) {
    console.error('Error loading rooms for RAG chatbot:', err);
    return cachedRooms || [];
  }
}

/**
 * Fetch recent reservations from Firestore
 */
export async function fetchRecentReservations(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedReservations && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedReservations;
  }

  try {
    const reservationsSnapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.ROOM_RESERVATIONS),
        orderBy('createdAt', 'desc'),
        limit(25)
      )
    );

    const list = reservationsSnapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        room: d.roomName || d.venue || d.room || '',
        activity: d.activity || d.title || 'Event',
        date: d.dateOfActivity || d.dateStart || d.startDate || '',
        time: `${d.timeStart || ''} - ${d.timeEnd || ''}`,
        status: d.status || 'Pending',
        organization: d.college || d.nameOfOrg || d.department || '',
      };
    });

    cachedReservations = list;
    return list;
  } catch (err) {
    console.warn('Reservations fetch note for RAG:', err.message);
    return cachedReservations || [];
  }
}

/**
 * Filter relevant rooms based on user query
 */
export function filterRelevantRooms(rooms, queryStr) {
  const q = (queryStr || '').toLowerCase();
  const numbers = q.match(/\d+/g) || [];
  const reqCap = numbers.length > 0 ? parseInt(numbers[0], 10) : null;

  const matchesEquipment = (room, term) => {
    const eqStr = (room.equipment || []).join(' ').toLowerCase();
    const typeStr = (room.type || '').toLowerCase();
    if (term === 'ac' || term === 'aircon' || term === 'air conditioning') {
      return eqStr.includes('air') || eqStr.includes('ac');
    }
    if (term === 'projector') return eqStr.includes('projector');
    if (term === 'computer' || term === 'computers' || term === 'pc' || term === 'lab') {
      return eqStr.includes('computer') || typeStr.includes('lab');
    }
    if (term === 'whiteboard' || term === 'board') return eqStr.includes('whiteboard') || eqStr.includes('board');
    if (term === 'tv' || term === 'smart board') return eqStr.includes('tv') || eqStr.includes('smart');
    if (term === 'sound' || term === 'audio' || term === 'mic') return eqStr.includes('audio') || eqStr.includes('sound');
    return eqStr.includes(term);
  };

  // Check building name mentions
  const buildingMentions = ['merlo', 'phinma', 'ramon', 'science', 'shahs', 'techhub', 'westcampus', 'westech'];
  const matchedBuildingTerm = buildingMentions.find((b) => q.includes(b));

  let filtered = (rooms || []).filter((r) => {
    // If specific building requested
    if (matchedBuildingTerm) {
      const bName = (r.buildingName || '').toLowerCase();
      if (!bName.includes(matchedBuildingTerm)) return false;
    }

    // If capacity specified (e.g. "40 students")
    if (reqCap && reqCap > 10 && reqCap < 500) {
      if (r.capacity < reqCap * 0.7 || r.capacity > reqCap * 2.2) {
        return false;
      }
    }

    return true;
  });

  // If filtered is too small, fallback to broader list
  if (filtered.length === 0) {
    filtered = rooms || [];
  }

  // Score relevance
  filtered.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    if (reqCap) {
      scoreA -= Math.abs(a.capacity - reqCap);
      scoreB -= Math.abs(b.capacity - reqCap);
    }
    if (q.includes('ac') || q.includes('aircon')) {
      if (matchesEquipment(a, 'ac')) scoreA += 20;
      if (matchesEquipment(b, 'ac')) scoreB += 20;
    }
    if (q.includes('projector')) {
      if (matchesEquipment(a, 'projector')) scoreA += 20;
      if (matchesEquipment(b, 'projector')) scoreB += 20;
    }
    if (q.includes('computer') || q.includes('lab')) {
      if (matchesEquipment(a, 'computer')) scoreA += 25;
      if (matchesEquipment(b, 'computer')) scoreB += 25;
    }

    return scoreB - scoreA;
  });

  return filtered.slice(0, 12);
}

/**
 * Builds compact, highly relevant RAG context for Gemini
 */
export async function buildRAGContext(userQuery) {
  const [rooms, reservations] = await Promise.all([
    fetchAllRoomsFlat(),
    fetchRecentReservations(),
  ]);

  const relevantRooms = filterRelevantRooms(rooms, userQuery);

  let context = `--- SYSTEM GROUNDING KNOWLEDGE ---\n${SYSTEM_KNOWLEDGE_BASE}\n\n`;

  context += `--- LIVE CAMPUS ROOM INVENTORY (${relevantRooms.length} Relevant Rooms) ---\n`;
  if (relevantRooms.length === 0) {
    context += 'No rooms currently listed in the database.\n';
  } else {
    relevantRooms.forEach((r) => {
      context += `• Room: ${r.roomCode} | Building: ${r.buildingName} (Floor ${r.floor}) | Type: ${r.type} | Capacity: ${r.capacity} seats | Equipment: ${r.equipment.length ? r.equipment.join(', ') : 'Standard'} | Status: ${r.status || 'Available'}\n`;
    });
  }

  if (reservations.length > 0) {
    context += `\n--- RECENT ACTIVE RESERVATIONS & BOOKINGS ---\n`;
    reservations.slice(0, 10).forEach((res) => {
      context += `• Room ${res.room}: ${res.activity} (${res.organization}) on ${res.date} [${res.time}] - Status: ${res.status}\n`;
    });
  }

  return { context, relevantRooms };
}

/**
 * Calls Gemini REST API with fallback models
 */
async function callGeminiAPI(fullPrompt, systemInstruction = '') {
  if (!GEMINI_API_KEY) {
    throw new Error('MISSING_API_KEY');
  }

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      
      const payload = {
        contents: [
          {
            parts: [{ text: fullPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.3, // Low temperature for high precision and zero hallucination
          topK: 30,
          topP: 0.9,
          maxOutputTokens: 1200,
        },
      };

      if (systemInstruction) {
        payload.systemInstruction = {
          parts: [{ text: systemInstruction }],
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text;
      }
    } catch (err) {
      console.warn(`Gemini model ${model} failed, trying fallback:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Failed to generate response from Gemini API.');
}

/**
 * Main RAG Query function
 * Streams or yields chunks to the chat UI
 */
export async function* queryGeminiWithRAG(userMessage, conversationHistory = []) {
  try {
    const trimmedMsg = (userMessage || '').trim();
    if (!trimmedMsg) return;

    // Check simple greetings / thank yous to respond instantly
    const lower = trimmedMsg.toLowerCase();
    if (/^(hi|hello|hey|good day|greetings)[!.]*$/i.test(lower)) {
      yield `Hello! I am **COBRA Assistant**, your official SWU-IFSS facility and scheduling assistant. 🐍\n\nHow can I help you today? You can ask me to **find a room**, **check room schedules**, **view equipment**, or learn about **reservation procedures**.`;
      return;
    }
    if (/^(thanks|thank you|salamat|thx)[!.]*$/i.test(lower)) {
      yield `You're very welcome! If you need anything else regarding SWU-IFSS rooms, schedules, or facility reservations, just let me know. 😊`;
      return;
    }

    // Build real-time RAG context
    const { context } = await buildRAGContext(trimmedMsg);

    const systemInstruction = `You are COBRA Assistant, the official AI Assistant for Southwestern University PHINMA's Integrated Facility Scheduling System (SWU-IFSS).

CRITICAL DIRECTIVES:
1. STRICT ANTI-HALLUCINATION: Base your answers ONLY on the provided system grounding knowledge and live campus room inventory. Never invent buildings, rooms, schedules, or policies that do not exist.
2. SCOPE ENFORCEMENT: Only answer questions about SWU-IFSS, campus rooms, building facilities, equipment, course scheduling, reservations, activity permits, academic calendars, and university policies. If the user asks about unrelated topics, politely decline and state that you are exclusively trained for SWU-IFSS campus operations.
3. ROOM RECOMMENDATIONS & DIRECTORY ACTIONS:
   - Whenever you suggest, recommend, list, or reference ANY room from the inventory (e.g. PH 101, MB 101, TH 309), you MUST ALWAYS append a room action tag on a new line at the end for each room:
     [ROOM_ACTION:{"roomCode":"EXACT_ROOM_CODE","buildingName":"BUILDING_NAME","floor":FLOOR_NUMBER,"capacity":CAPACITY_NUMBER,"type":"ROOM_TYPE"}]
   - This tag automatically creates interactive "View Room Details (Directory)", "View Schedule", and "Reserve Room" buttons for the user.
4. TONE & FORMAT:
   - Professional, clear, and helpful.
   - Use clean Markdown with bold room codes (e.g. **PH 101**) and bullet points (•) for specifications.`;

    let promptWithHistory = `${context}\n\nCONVERSATION HISTORY:\n`;
    (conversationHistory || []).slice(-6).forEach((m) => {
      promptWithHistory += `${m.role === 'user' ? 'USER' : 'COBRA'}: ${m.text}\n`;
    });
    promptWithHistory += `\nUSER: ${trimmedMsg}\n\nCOBRA:`;

    const fullResponse = await callGeminiAPI(promptWithHistory, systemInstruction);

    yield fullResponse;

  } catch (err) {
    console.error('RAG Chatbot error:', err);
    if (err.message === 'MISSING_API_KEY') {
      yield '⚠️ **Gemini API Key Missing**: Please make sure `VITE_GEMINI_API_KEY` is configured in your environment to enable AI responses.';
      return;
    }
    yield `⚠️ I encountered an issue processing your request (${err.message || 'Connection error'}). Please try again or ask for specific room details.`;
  }
}

/**
 * Dynamic quick prompts tailored to SWU-IFSS
 */
export async function generateQuickPrompts() {
  return [
    'Find an available room for 40 students with AC',
    'Which rooms have projectors and computers?',
    'How do I file a room reservation permit?',
    'Show me rooms in Merlo Building',
    'What is the 7-day advance reservation rule?',
  ];
}

/**
 * Preload system data into in-memory cache
 */
export async function preloadSystemData() {
  try {
    await Promise.all([
      fetchAllRoomsFlat(true),
      fetchRecentReservations(true),
    ]);
    return true;
  } catch (err) {
    console.warn('Preload note:', err);
    return false;
  }
}

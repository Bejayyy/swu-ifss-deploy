/**
 * RAG (Retrieval-Augmented Generation) Chatbot Service
 * Integrates Gemini AI with Firestore data to answer queries about:
 * - Rooms (availability, capacity, equipment, performance)
 * - Buildings and floors
 * - Room schedules and reservations
 * - Requirements and filtering
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { COLLECTIONS } from '../firebase/constants';

// Initialize Gemini AI with new API format (keys starting with AQ)
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '');

/**
 * Fetch all buildings with their floors and rooms
 */
async function fetchBuildingsData() {
  try {
    const buildingsSnapshot = await getDocs(collection(db, COLLECTIONS.BUILDINGS));
    const buildings = [];

    for (const buildingDoc of buildingsSnapshot.docs) {
      const buildingData = buildingDoc.data();
      const building = {
        id: buildingDoc.id,
        name: buildingData.name,
        code: buildingData.code,
        floors: []
      };

      // Fetch floors for this building
      const floorsSnapshot = await getDocs(
        collection(db, COLLECTIONS.BUILDINGS, buildingDoc.id, COLLECTIONS.FLOORS)
      );

      for (const floorDoc of floorsSnapshot.docs) {
        const floorData = floorDoc.data();
        const floor = {
          id: floorDoc.id,
          number: floorData.floorNumber,
          label: floorData.label,
          rooms: []
        };

        // Fetch rooms for this floor
        const roomsSnapshot = await getDocs(
          collection(db, COLLECTIONS.BUILDINGS, buildingDoc.id, COLLECTIONS.FLOORS, floorDoc.id, COLLECTIONS.ROOMS)
        );

        floor.rooms = roomsSnapshot.docs.map(roomDoc => {
          const roomData = roomDoc.data();
          return {
            id: roomDoc.id,
            name: roomData.name,
            roomCode: roomData.roomCode,
            type: roomData.type || 'Classroom',
            status: roomData.status || 'Available',
            capacity: roomData.capacity || 0,
            equipment: roomData.equipment || [],
            maintenanceStatus: roomData.maintenanceStatus || 'operational',
            maintenanceStartDate: roomData.maintenanceStartDate,
            maintenanceEndDate: roomData.maintenanceEndDate,
            maintenanceReason: roomData.maintenanceReason,
            managedBy: roomData.managedByName || roomData.managedBy
          };
        });

        building.floors.push(floor);
      }

      buildings.push(building);
    }

    return buildings;
  } catch (error) {
    console.error('Error fetching buildings data:', error);
    return [];
  }
}

/**
 * Fetch room reservations/schedules
 */
async function fetchRoomReservations() {
  try {
    const reservationsSnapshot = await getDocs(
      query(
        collection(db, COLLECTIONS.ROOM_RESERVATIONS),
        orderBy('createdAt', 'desc')
      )
    );

    return reservationsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        room: data.roomName || data.venue,
        status: data.status,
        requestType: data.requestType,
        startDate: data.startDate,
        endDate: data.endDate,
        timeRange: data.timeRange,
        requestorName: data.requestorName
      };
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return [];
  }
}

/**
 * Fetch schedule entries (academic scheduling)
 */
async function fetchScheduleEntries() {
  try {
    const scheduleSnapshot = await getDocs(collection(db, COLLECTIONS.SCHEDULE_ENTRIES));
    
    return scheduleSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        courseCode: data.courseCode,
        courseName: data.courseName,
        room: data.room,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        instructor: data.instructor,
        section: data.section
      };
    });
  } catch (error) {
    console.error('Error fetching schedule entries:', error);
    return [];
  }
}

/**
 * Build context string from system data for RAG
 */
async function buildSystemContext() {
  const buildings = await fetchBuildingsData();
  const reservations = await fetchRoomReservations();
  const schedules = await fetchScheduleEntries();

  let context = '=== SYSTEM DATA CONTEXT ===\n\n';

  // Buildings and Rooms
  context += '## BUILDINGS AND ROOMS:\n\n';
  buildings.forEach(building => {
    context += `Building: ${building.name} (${building.code})\n`;
    building.floors.forEach(floor => {
      context += `  Floor ${floor.number} (${floor.label}):\n`;
      floor.rooms.forEach(room => {
        context += `    - ${room.roomCode || room.name}: ${room.type}, Capacity: ${room.capacity} people\n`;
        context += `      Status: ${room.status}, Maintenance: ${room.maintenanceStatus}\n`;
        if (room.equipment && room.equipment.length > 0) {
          context += `      Equipment: ${room.equipment.join(', ')}\n`;
        }
        if (room.maintenanceStatus !== 'operational') {
          context += `      Maintenance Period: ${room.maintenanceStartDate} to ${room.maintenanceEndDate}\n`;
          context += `      Reason: ${room.maintenanceReason}\n`;
        }
      });
    });
    context += '\n';
  });

  // Current Reservations
  if (reservations.length > 0) {
    context += '\n## RECENT ROOM RESERVATIONS:\n\n';
    reservations.slice(0, 20).forEach(res => {
      context += `- ${res.title} (${res.room})\n`;
      context += `  Status: ${res.status}, Type: ${res.requestType}\n`;
      context += `  Date: ${res.startDate} to ${res.endDate}\n`;
      context += `  Time: ${res.timeRange}\n\n`;
    });
  }

  // Academic Schedules
  if (schedules.length > 0) {
    context += '\n## ACADEMIC CLASS SCHEDULES:\n\n';
    schedules.slice(0, 30).forEach(sched => {
      context += `- ${sched.courseCode} ${sched.courseName} (Section ${sched.section})\n`;
      context += `  Room: ${sched.room}, Instructor: ${sched.instructor}\n`;
      context += `  Schedule: ${sched.dayOfWeek} ${sched.startTime}-${sched.endTime}\n\n`;
    });
  }

  return context;
}

/**
 * Query Gemini AI with RAG context
 */
export async function queryGeminiWithRAG(userMessage, conversationHistory = []) {
  try {
    // Build system context from Firestore data
    const systemContext = await buildSystemContext();

    // Initialize Gemini model (using gemini-1.5-flash for new API format with AQ keys)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash'
    });

    // Build the full prompt with system context and conversation history
    let fullPrompt = `You are COBRA Assistant, a helpful AI chatbot for the SWU Integrated Facility Scheduling System (IFSS).

Your role is to help users:
- Find available rooms based on requirements (capacity, equipment, location)
- Check room schedules and availability
- Provide information about room performance and utilization
- Answer questions about buildings, floors, and facilities
- Assist with room reservation inquiries

IMPORTANT INSTRUCTIONS:
- Always answer based on the SYSTEM DATA provided below
- Be specific and cite room codes, building names, and capacities when answering
- If asked about availability, check the reservations and schedules data
- If a room doesn't meet requirements, suggest alternatives
- Be concise but informative
- If you don't have the data to answer, say so clearly

${systemContext}

=== CONVERSATION HISTORY ===
`;

    // Add conversation history
    if (conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        fullPrompt += `${msg.role === 'user' ? 'USER' : 'ASSISTANT'}: ${msg.text}\n`;
      });
    }

    // Add current user message
    fullPrompt += `\nUSER: ${userMessage}\n\nASSISTANT:`;

    // Generate response
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    return {
      success: true,
      message: text
    };
  } catch (error) {
    console.error('Error querying Gemini AI:', error);
    
    if (error.message?.includes('API_KEY') || error.message?.includes('API key')) {
      return {
        success: false,
        message: 'Gemini API key is not configured or invalid. Please add a valid VITE_GEMINI_API_KEY (starting with AQ) to your .env file.'
      };
    }

    if (error.message?.includes('404') || error.message?.includes('not found')) {
      return {
        success: false,
        message: 'Model not available. The new Gemini API format may require different configuration. Please ensure you\'re using the latest API key format (starting with AQ).'
      };
    }

    return {
      success: false,
      message: 'Sorry, I encountered an error processing your request. Please try again or check your API key format.'
    };
  }
}

/**
 * Generate quick prompt suggestions based on current system state
 */
export async function generateQuickPrompts() {
  const buildings = await fetchBuildingsData();
  const totalRooms = buildings.reduce((sum, b) => 
    sum + b.floors.reduce((fsum, f) => fsum + f.rooms.length, 0), 0
  );

  const prompts = [
    `Show me available rooms for ${Math.floor(Math.random() * 50 + 20)} students`,
    'Which rooms have projectors and air conditioning?',
    'What is the largest classroom available?',
    'Show me all rooms in the main building',
    'Which rooms are currently under maintenance?'
  ];

  return prompts;
}

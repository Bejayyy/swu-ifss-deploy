# COBRA Assistant - Query Examples & Use Cases

## Room Capacity Queries

### Find Rooms by Student Count
```
✅ "Find an available room for 40 students"
✅ "I need a room that can fit 50 people"
✅ "Show me all rooms with capacity over 60"
✅ "What's the smallest room available?"
✅ "List all large lecture halls"
```

**What the AI will do:**
- Query all rooms from Firestore
- Filter by capacity requirements
- Check availability against reservations
- Suggest alternatives if exact match not found

---

## Equipment & Facility Queries

### Search by Equipment Type
```
✅ "Which rooms have projectors?"
✅ "Show me all computer labs"
✅ "Find rooms with air conditioning and whiteboards"
✅ "List rooms with video conferencing equipment"
✅ "Which classrooms have smart boards?"
```

**What the AI will do:**
- Check room equipment arrays in Firestore
- Match against user requirements
- List all matching rooms with building/floor info

---

## Availability & Schedule Queries

### Check Room Availability
```
✅ "Is Room 301 available tomorrow at 2 PM?"
✅ "Show available rooms this Friday afternoon"
✅ "What rooms are free right now?"
✅ "When is the auditorium next available?"
✅ "Show me the schedule for Room A-205"
```

**What the AI will do:**
- Cross-reference room_reservations collection
- Check schedule_entries for academic classes
- Identify time slots without bookings
- Suggest alternative times if unavailable

---

## Building & Location Queries

### Find Rooms by Location
```
✅ "Show all rooms in the Main Building"
✅ "What rooms are on the 3rd floor?"
✅ "List all facilities in Building B"
✅ "Which building has the most classrooms?"
✅ "Show me a map of Computer Labs"
```

**What the AI will do:**
- Navigate building → floor → room hierarchy
- Aggregate room counts per building/floor
- Provide structured location information

---

## Maintenance Status Queries

### Check Maintenance Information
```
✅ "Which rooms are currently under maintenance?"
✅ "When will Room 205 be available again?"
✅ "Why is the science lab closed?"
✅ "Show all operational rooms in Building C"
✅ "List rooms scheduled for maintenance next week"
```

**What the AI will do:**
- Check maintenanceStatus field on rooms
- Show maintenance start/end dates
- Display maintenance reasons
- Filter out non-operational rooms from availability

---

## Performance & Analytics Queries

### Room Utilization Insights
```
✅ "Which rooms are most frequently booked?"
✅ "What's the utilization rate for computer labs?"
✅ "Show reservation statistics for this month"
✅ "Which rooms are underutilized?"
✅ "How many reservations does Room 301 have this week?"
```

**What the AI will do:**
- Analyze room_reservations collection
- Calculate booking frequency
- Compare against total available time
- Identify usage patterns

---

## Complex Multi-Criteria Queries

### Combined Requirements
```
✅ "Find a room for 30 students with a projector, available Monday at 10 AM"
✅ "I need a ground floor classroom with wheelchair access and AC for 25 people"
✅ "Show available computer labs tomorrow morning that seat at least 40"
✅ "Which large rooms with video conferencing are free this week?"
```

**What the AI will do:**
- Apply multiple filters simultaneously:
  - Capacity requirement
  - Equipment matching
  - Schedule availability
  - Location constraints
- Rank results by best match
- Suggest partial matches if no perfect fit

---

## Reservation & Request Help

### Request Assistance
```
✅ "How do I book a room?"
✅ "What information do I need for a room reservation?"
✅ "Who approves room reservations?"
✅ "Can I reserve multiple rooms at once?"
✅ "What's the approval process for academic requests?"
```

**What the AI will do:**
- Reference approval_workflows collection
- Explain reservation requirements
- Describe the approval chain
- Guide through the request process

---

## Comparison Queries

### Compare Rooms
```
✅ "Compare Room 301 and Room 305"
✅ "What's the difference between Lab A and Lab B?"
✅ "Which is better for a seminar: Room 201 or Room 203?"
✅ "Show me similar rooms to the Main Auditorium"
```

**What the AI will do:**
- Pull specifications for each room
- Compare capacity, equipment, location
- Highlight differences
- Recommend based on typical use cases

---

## Time-Based Queries

### Scheduling Patterns
```
✅ "What classes are scheduled in Room 301 this week?"
✅ "Show me the Monday schedule for all computer labs"
✅ "Which rooms have morning availability?"
✅ "Are there any weekend reservations?"
✅ "What's the busiest time slot for room bookings?"
```

**What the AI will do:**
- Query schedule_entries by time ranges
- Group reservations by day/time
- Identify peak usage periods
- Show available time slots

---

## Emergency & Urgent Queries

### Quick Availability Checks
```
✅ "I need a room RIGHT NOW for 20 people!"
✅ "Emergency: where can I hold a meeting in 10 minutes?"
✅ "Quick! Show me any available room with a projector"
✅ "Urgent: which classrooms are empty right now?"
```

**What the AI will do:**
- Check current time against schedules
- Identify immediately available rooms
- Prioritize by proximity/convenience
- Provide fastest route to booking

---

## Academic Schedule Queries

### Class & Course Information
```
✅ "What courses are taught in Room A-301?"
✅ "Show me Professor Smith's classroom schedule"
✅ "Which rooms are used for Computer Science classes?"
✅ "What's the schedule for BSIT-3A?"
✅ "List all Friday afternoon classes"
```

**What the AI will do:**
- Query schedule_entries collection
- Filter by course, instructor, section
- Show assigned rooms and time slots
- Cross-reference with room capacity

---

## Data Export & Reporting

### Get Structured Data
```
✅ "List all rooms in table format"
✅ "Give me a summary of all buildings and their room counts"
✅ "Show total capacity across all facilities"
✅ "Generate a report of available rooms tomorrow"
```

**What the AI will do:**
- Format data in readable tables
- Calculate aggregates and totals
- Provide structured output
- Suggest export options

---

## Tips for Best Results

### ✅ DO:
- Be specific about requirements (capacity, equipment, time)
- Ask follow-up questions for clarification
- Use natural language - the AI understands context
- Mention building/room codes if you know them

### ❌ DON'T:
- Ask about unrelated topics (AI is trained for facility management)
- Expect real-time booking (use the reservation system)
- Request personal information about users
- Ask hypothetical questions without context

---

## Sample Conversation Flow

```
USER: "I need to book a room for a workshop"

BOT: "I can help you find a suitable room! Could you tell me:
- How many attendees? (capacity needed)
- What equipment do you need? (projector, whiteboard, etc.)
- When do you need it? (date and time)
- Any location preferences?"

USER: "About 35 people, need a projector and whiteboard, next Tuesday at 2 PM"

BOT: "Based on your requirements, here are available rooms for Tuesday at 2 PM:

1. **Room 305 (Main Building, 3rd Floor)**
   - Capacity: 40 people
   - Equipment: Projector, Whiteboard, Air Conditioning
   - Status: Available

2. **Room B-201 (Building B, 2nd Floor)**
   - Capacity: 45 people
   - Equipment: Smart Board (includes projector), Whiteboard
   - Status: Available

Would you like more details about any of these rooms?"
```

---

## Advanced Features

### Context Awareness
The chatbot remembers your conversation:

```
USER: "Show me rooms with 50 capacity"
BOT: [Lists rooms]

USER: "Which of those have projectors?"
BOT: [Filters previous results by equipment]

USER: "What about the first one?"
BOT: [Provides details about first room from previous list]
```

### Clarification Requests
If your query is ambiguous:

```
USER: "Is the lab available?"
BOT: "I found several labs in the system:
- Computer Lab A (Building A, 2nd Floor)
- Computer Lab B (Building B, 1st Floor)
- Science Lab (Main Building, 3rd Floor)

Which lab are you asking about? Or would you like to see availability for all labs?"
```

---

## Real-Time Data Sources

The chatbot queries these Firestore collections in real-time:

| Collection | Data Provided |
|------------|---------------|
| `buildings` | Building info, codes, structure |
| `floors` (subcollection) | Floor numbers, labels, managers |
| `rooms` (subcollection) | Capacity, equipment, status, maintenance |
| `room_reservations` | Current/upcoming bookings, status |
| `schedule_entries` | Academic schedules, courses, instructors |
| `maintenance_schedules` | Scheduled maintenance periods |

**Note**: All data is fetched fresh on each query to ensure accuracy!

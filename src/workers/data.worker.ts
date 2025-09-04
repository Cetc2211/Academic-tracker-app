/// <reference lib="webworker" />

import type { Group, Student, StudentObservation, PartialId, AppSettings, AllPartialsData } from '@/lib/placeholder-data';

type AppState = {
  groups: Group[];
  students: Student[];
  observations: { [studentId: string]: StudentObservation[] };
  settings: AppSettings;
  partialsData: AllPartialsData;
  activeGroupId: string | null;
};

// --- STATE MANAGEMENT ---
let state: AppState = {
  groups: [],
  students: [],
  observations: {},
  settings: {
    institutionName: "Mi Institución",
    logo: "",
    theme: "theme-mint",
    apiKey: "",
    signature: "",
    facilitatorName: ""
  },
  partialsData: {},
  activeGroupId: null,
};

const getStorageKey = (baseKey: string, userId: string) => `${baseKey}_${userId}`;

function loadState(userId: string) {  
  try {
    state.groups = JSON.parse(self.localStorage.getItem(getStorageKey('app_groups', userId)) || '[]');
    state.students = JSON.parse(self.localStorage.getItem(getStorageKey('app_students', userId)) || '[]');
    state.observations = JSON.parse(self.localStorage.getItem(getStorageKey('app_observations', userId)) || '{}');
    state.settings = JSON.parse(self.localStorage.getItem(getStorageKey('app_settings', userId)) || JSON.stringify({
        institutionName: "Mi Institución",
        logo: "",
        theme: "theme-mint",
        apiKey: "",
        signature: "",
        facilitatorName: ""
    }));
    state.partialsData = JSON.parse(self.localStorage.getItem(getStorageKey('app_partialsData', userId)) || '{}');
    
    const storedActiveGroupId = JSON.parse(self.localStorage.getItem(getStorageKey('activeGroupId_v1', userId)) || 'null');
    if (state.groups.some(g => g.id === storedActiveGroupId)) {
        state.activeGroupId = storedActiveGroupId;
    } else if (state.groups.length > 0) {
        state.activeGroupId = state.groups[0].id;
    } else {
        state.activeGroupId = null;
    }

  } catch (error) {
    console.error("Error loading state from localStorage", error);
    // In case of error, reset to a default state
    state = {
      groups: [],
      students: [],
      observations: {},
      settings: {
         institutionName: "Mi Institución",
        logo: "",
        theme: "theme-mint",
        apiKey: "",
        signature: "",
        facilitatorName: ""
      },
      partialsData: {},
      activeGroupId: null,
    };
  }
}

function saveState(userId: string) {
  try {
    self.localStorage.setItem(getStorageKey('app_groups', userId), JSON.stringify(state.groups));
    self.localStorage.setItem(getStorageKey('app_students', userId), JSON.stringify(state.students));
    self.localStorage.setItem(getStorageKey('app_observations', userId), JSON.stringify(state.observations));
    self.localStorage.setItem(getStorageKey('app_settings', userId), JSON.stringify(state.settings));
    self.localStorage.setItem(getStorageKey('app_partialsData', userId), JSON.stringify(state.partialsData));
    self.localStorage.setItem(getStorageKey('activeGroupId_v1', userId), JSON.stringify(state.activeGroupId));
  } catch(error) {
    console.error("Error saving state to localStorage", error);
  }
}


// --- ACTIONS ---
const actions = {
  INIT: ({ userId }: { userId: string }) => {
    loadState(userId);
    return { success: true, state };
  },

  SET_SETTINGS: ({ userId, newSettings }: { userId: string, newSettings: Partial<AppSettings> }) => {
    // Read-Modify-Write to prevent race conditions
    const currentState = JSON.parse(self.localStorage.getItem(getStorageKey('app_settings', userId)) || JSON.stringify(defaultSettings));
    state.settings = { ...currentState, ...newSettings };
    saveState(userId);
    return { success: true, settings: state.settings };
  },

  CREATE_GROUP: ({ userId, group }: { userId: string, group: Group }) => {
    state.groups.push(group);
     if (state.groups.length === 1 && group.facilitator) {
      actions.SET_SETTINGS({ userId, newSettings: { facilitatorName: group.facilitator } });
    }
    saveState(userId);
    return { success: true, groups: state.groups };
  },

  RESET_ALL_DATA: ({ userId }: { userId: string }) => {
    self.localStorage.removeItem(getStorageKey('app_groups', userId));
    self.localStorage.removeItem(getStorageKey('app_students', userId));
    self.localStorage.removeItem(getStorageKey('app_observations', userId));
    self.localStorage.removeItem(getStorageKey('app_settings', userId));
    self.localStorage.removeItem(getStorageKey('app_partialsData', userId));
    self.localStorage.removeItem(getStorageKey('activeGroupId_v1', userId));
    loadState(userId);
    return { success: true, state };
  },
  
  SET_PARTIAL_DATA: ({ userId, groupId, partialId, field, value }: { userId: string, groupId: string, partialId: PartialId, field: keyof any, value: any }) => {
      if (!state.partialsData[groupId]) {
          state.partialsData[groupId] = {};
      }
      if (!state.partialsData[groupId][partialId]) {
           state.partialsData[groupId][partialId] = {
                grades: {},
                attendance: {},
                participations: {},
                activities: [],
                activityRecords: {},
                recoveryGrades: {},
                feedbacks: {},
           };
      }
      (state.partialsData[groupId][partialId] as any)[field] = value;
      saveState(userId);
      return { success: true, partialsData: state.partialsData };
  },

  // Add other actions...
  DELETE_GROUP: ({ userId, groupId }: { userId: string, groupId: string }) => {
    state.groups = state.groups.filter(g => g.id !== groupId);
    if (state.activeGroupId === groupId) {
        state.activeGroupId = state.groups.length > 0 ? state.groups[0].id : null;
    }
    delete state.partialsData[groupId];
    saveState(userId);
    return { success: true, groups: state.groups, activeGroupId: state.activeGroupId };
  },

  UPDATE_GROUP: ({ userId, groupId, data }: { userId: string, groupId: string, data: Partial<Group> }) => {
    state.groups = state.groups.map(g => g.id === groupId ? { ...g, ...data } : g);
    saveState(userId);
    return { success: true, groups: state.groups };
  },
  
  ADD_STUDENTS_TO_GROUP: ({ userId, groupId, students }: { userId: string, groupId: string, students: Student[] }) => {
     const newStudentIds = new Set(students.map(s => s.id));
     state.students = [...state.students.filter(s => !newStudentIds.has(s.id)), ...students];
     state.groups = state.groups.map(g => g.id === groupId ? { ...g, students: [...g.students, ...students] } : g);
     saveState(userId);
     return { success: true, groups: state.groups, allStudents: state.students };
  },
  
  REMOVE_STUDENT_FROM_GROUP: ({ userId, groupId, studentId }: { userId: string, groupId: string, studentId: string }) => {
      state.groups = state.groups.map(g => g.id === groupId ? { ...g, students: g.students.filter(s => s.id !== studentId) } : g);
      saveState(userId);
      return { success: true, groups: state.groups };
  },
  
  UPDATE_STUDENT: ({ userId, studentId, data }: { userId: string, studentId: string, data: Partial<Student> }) => {
      state.students = state.students.map(s => s.id === studentId ? { ...s, ...data } : s);
      state.groups = state.groups.map(g => ({
          ...g,
          students: g.students.map(s => s.id === studentId ? { ...s, ...data } : s),
      }));
      saveState(userId);
      return { success: true, groups: state.groups, allStudents: state.students };
  },
  
  ADD_STUDENT_OBSERVATION: ({ userId, observation }: { userId: string, observation: StudentObservation }) => {
      if (!state.observations[observation.studentId]) {
          state.observations[observation.studentId] = [];
      }
      state.observations[observation.studentId].push(observation);
      saveState(userId);
      return { success: true, observations: state.observations };
  },

  UPDATE_STUDENT_OBSERVATION: ({ userId, studentId, observationId, updateText, isClosing }: { userId: string, studentId: string, observationId: string, updateText: string, isClosing: boolean }) => {
    const studentObs = (state.observations[studentId] || []).map(obs => {
        if (obs.id === observationId) {
            const newUpdate = { date: new Date().toISOString(), update: updateText };
            return {
                ...obs,
                followUpUpdates: [...obs.followUpUpdates, newUpdate],
                isClosed: isClosing
            };
        }
        return obs;
    });
    state.observations[studentId] = studentObs;
    saveState(userId);
    return { success: true, observations: state.observations };
  },

};

// --- MESSAGE HANDLER ---
self.onmessage = (e: MessageEvent) => {
  const { action, payload } = e.data;
  
  if (actions[action as keyof typeof actions]) {
    const result = (actions[action as keyof typeof actions] as any)(payload);
    self.postMessage({ action: `ACK_${action}`, payload: result });
  } else {
    self.postMessage({ action: `ERROR`, payload: { message: `Unknown action: ${action}` }});
  }
};

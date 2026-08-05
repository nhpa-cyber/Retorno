export interface FirebasePreset {
  id: string;
  name: string;
  badge: string;
  badgeColor: string;
  description: string;
  config: {
    projectId: string;
    appId: string;
    apiKey: string;
    authDomain: string;
    firestoreDatabaseId: string;
    storageBucket: string;
    messagingSenderId: string;
    measurementId?: string;
    oAuthClientId?: string;
  };
}

export const FIREBASE_PRESETS: FirebasePreset[] = [
  {
    id: "banco-01",
    name: "Banco 01 (Turno Diurno 07h-17h)",
    badge: "Diurno (07:00)",
    badgeColor: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    description: "banco-01-34be4 (Banco Principal / Turno Diurno 07:00 às 17:00)",
    config: {
      projectId: "banco-01-34be4",
      appId: "1:769319279792:web:0b1f64349b2a2b482aaf75",
      apiKey: "AIzaSyAxVFlljdf_QXhVgqoYbTjPJXnzLIhHCTw",
      authDomain: "banco-01-34be4.firebaseapp.com",
      firestoreDatabaseId: "(default)",
      storageBucket: "banco-01-34be4.firebasestorage.app",
      messagingSenderId: "769319279792",
      measurementId: "",
      oAuthClientId: ""
    }
  },
  {
    id: "banco-02",
    name: "Banco 02 (Turno Vespertino 17h-22h)",
    badge: "Vespertino (17:00)",
    badgeColor: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    description: "banco-02-2fb6b (Banco Segundo / Turno Vespertino 17:00 às 22:00)",
    config: {
      projectId: "banco-02-2fb6b",
      appId: "1:364866790920:web:6f43aa475321a4a3f853bd",
      apiKey: "AIzaSyAd9ouXvKudfi4fOXQ34FZ9hWNkfOW8BvI",
      authDomain: "banco-02-2fb6b.firebaseapp.com",
      firestoreDatabaseId: "(default)",
      storageBucket: "banco-02-2fb6b.firebasestorage.app",
      messagingSenderId: "364866790920",
      measurementId: "",
      oAuthClientId: ""
    }
  },
  {
    id: "banco-03",
    name: "Banco 03 (Turno Noturno 22h-07h)",
    badge: "Noturno (22:00)",
    badgeColor: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
    description: "banco-03-6b1ea (Banco Terceiro / Turno Noturno 22:00 às 07:00)",
    config: {
      projectId: "banco-03-6b1ea",
      appId: "1:645365828863:web:beb28f8f10226a02e210ca",
      apiKey: "AIzaSyCNeRWfV7L-i3X1GBegzETsEbpGkmK_s4g",
      authDomain: "banco-03-6b1ea.firebaseapp.com",
      firestoreDatabaseId: "(default)",
      storageBucket: "banco-03-6b1ea.firebasestorage.app",
      messagingSenderId: "645365828863",
      measurementId: "",
      oAuthClientId: ""
    }
  }
];

export function getActivePresetId(projectId?: string): string {
  if (!projectId) return "custom";
  const matched = FIREBASE_PRESETS.find(p => p.config.projectId === projectId || p.id === projectId);
  return matched ? matched.id : "custom";
}

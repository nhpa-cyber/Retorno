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
    id: "banco-01-34be4",
    name: "Banco 01 (Padrão / Principal)",
    badge: "Padrão",
    badgeColor: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    description: "banco-01-34be4 (Banco de Dados Padrão da Plataforma)",
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
    id: "banco-02-2fb6b",
    name: "Banco 02 (Secundário)",
    badge: "Banco 02",
    badgeColor: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    description: "banco-02-2fb6b (Banco de Dados Secundário)",
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
  }
];

export function getActivePresetId(projectId?: string): string {
  if (!projectId) return "custom";
  const matched = FIREBASE_PRESETS.find(p => p.config.projectId === projectId);
  return matched ? matched.id : "custom";
}

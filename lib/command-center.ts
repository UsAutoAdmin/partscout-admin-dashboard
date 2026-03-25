import { promises as fs } from "fs";
import path from "path";

export type CommandMessage = {
  role: "user" | "assistant";
  body: string;
  createdAt: string;
};

export type CommandTask = {
  id: number;
  title: string;
  status: "open" | "done";
  createdAt: string;
  updatedAt?: string;
};

export type CommandState = {
  messages: CommandMessage[];
  tasks: CommandTask[];
  lastUpdated: string | null;
};

const dataDir = path.join(process.cwd(), "media");
const statePath = path.join(dataDir, "command-center-state.json");

const memoryState: CommandState = {
  messages: [],
  tasks: [],
  lastUpdated: null,
};

async function ensureDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function getCommandState(): Promise<CommandState> {
  try {
    const raw = await fs.readFile(statePath, "utf8");
    return JSON.parse(raw) as CommandState;
  } catch {
    return memoryState;
  }
}

async function saveCommandState(state: CommandState): Promise<CommandState> {
  state.lastUpdated = new Date().toISOString();
  try {
    await ensureDir();
    await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
  } catch {
    memoryState.messages = state.messages;
    memoryState.tasks = state.tasks;
    memoryState.lastUpdated = state.lastUpdated;
  }
  return state;
}

function addMessage(state: CommandState, role: "user" | "assistant", body: string) {
  state.messages.push({ role, body, createdAt: new Date().toISOString() });
}

export async function processCommand(message: string): Promise<{ reply: string; state: CommandState }> {
  const state = await getCommandState();
  const text = message.trim();

  if (!text) {
    return { reply: "Say something specific and I’ll track it here.", state };
  }

  addMessage(state, "user", text);
  const lowered = text.toLowerCase();
  let reply = "Captured. I’m treating this as dashboard-native communication for Part Scout.";

  if (lowered.startsWith("add task ")) {
    const title = text.slice(9).trim();
    const id = Math.max(0, ...state.tasks.map((task) => task.id)) + 1;
    state.tasks.push({ id, title, status: "open", createdAt: new Date().toISOString() });
    reply = `Added task #${id}: ${title}`;
  } else if (lowered.startsWith("complete task ")) {
    const raw = text.slice(14).trim();
    const id = Number(raw);
    const task = state.tasks.find((item) => item.id === id);
    if (task) {
      task.status = "done";
      task.updatedAt = new Date().toISOString();
      reply = `Marked task #${id} complete.`;
    } else {
      reply = `I couldn’t find task #${raw}.`;
    }
  } else if (lowered === "show tasks" || lowered === "list tasks") {
    reply = state.tasks.length
      ? state.tasks.map((task) => `#${task.id} [${task.status}] ${task.title}`).join("\n")
      : "No tasks yet.";
  } else if (lowered === "status") {
    reply = `Messages logged: ${state.messages.length}. Tasks tracked: ${state.tasks.length}.`;
  } else {
    reply += " Right now I can persist notes, maintain lightweight task state, and serve as the communication-first home while deeper command routing gets wired in.";
  }

  addMessage(state, "assistant", reply);
  const saved = await saveCommandState(state);
  return { reply, state: saved };
}

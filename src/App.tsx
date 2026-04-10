import React, { useState, useEffect, useRef, Suspense, useMemo } from "react";
import io from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Sphere, Html } from "@react-three/drei";
import * as THREE from "three";
import { ThreeElements } from "@react-three/fiber";

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

import { 
  Clock, 
  MapPin, 
  Heart, 
  AlertCircle, 
  Smile, 
  Frown, 
  Meh, 
  Zap,
  Coffee,
  Ghost,
  Loader2,
  Send,
  MessageSquare,
  Globe as GlobeIcon,
  LayoutList,
  X,
  Sparkles
} from "lucide-react";

// --- Utils ---
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// --- Types ---

type Mood = "anxious" | "chill" | "guilty" | "rebellious" | "paralyzed" | "tired";

interface Procrastinator {
  id: string;
  name: string;
  mood: Mood;
  task: string;
  deadline: string;
  location: {
    lat: number;
    lng: number;
  } | null;
  startTime: number;
  cheers: number;
}

interface Message {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

const MOODS: { value: Mood; label: string; icon: any; color: string; bg: string; accent: string }[] = [
  { value: "anxious", label: "焦慮不安", icon: AlertCircle, color: "text-orange-600", bg: "bg-orange-50", accent: "bg-lemon" },
  { value: "chill", label: "佛系逃避", icon: Coffee, color: "text-green-600", bg: "bg-green-50", accent: "bg-sky" },
  { value: "guilty", label: "罪惡感深重", icon: Frown, color: "text-blue-600", bg: "bg-blue-50", accent: "bg-magenta" },
  { value: "rebellious", label: "我就爛", icon: Zap, color: "text-yellow-600", bg: "bg-yellow-50", accent: "bg-lemon" },
  { value: "paralyzed", label: "原地癱瘓", icon: Ghost, color: "text-purple-600", bg: "bg-purple-50", accent: "bg-magenta" },
  { value: "tired", label: "心好累", icon: Meh, color: "text-gray-600", bg: "bg-gray-50", accent: "bg-sky" },
];

// --- Hand-drawn Decorations ---

const DoodleStar = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={cn("w-12 h-12 fill-lemon", className)}>
    <path d="M50 5 L61 35 L95 35 L68 57 L78 91 L50 70 L22 91 L32 57 L5 35 L39 35 Z" stroke="black" strokeWidth="2" />
  </svg>
);

const DoodleCloud = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 120 80" className={cn("w-16 h-10 fill-sky", className)}>
    <path d="M20 60 Q10 60 10 50 Q10 35 25 35 Q30 15 50 15 Q75 15 80 35 Q110 35 110 55 Q110 70 95 70 L20 70" stroke="black" strokeWidth="2" />
  </svg>
);

const DoodleCircle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={cn("w-10 h-10 fill-magenta/20", className)}>
    <circle cx="50" cy="50" r="45" stroke="black" strokeWidth="2" strokeDasharray="5 5" />
  </svg>
);

const DoodleArrow = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 50" className={cn("w-16 h-8 fill-none stroke-black", className)}>
    <path d="M10 25 Q50 10 90 25 M80 15 L90 25 L80 35" strokeWidth="2" fill="none" />
  </svg>
);

const DoodleSquiggle = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 20" className={cn("w-20 h-4 fill-none stroke-magenta", className)}>
    <path d="M0 10 Q10 0 20 10 T40 10 T60 10 T80 10 T100 10" strokeWidth="2" fill="none" />
  </svg>
);

// --- Globe Components ---

function GlobePoints({ procrastinators, onSelect }: { procrastinators: Procrastinator[], onSelect: (p: Procrastinator) => void }) {
  const points = useMemo(() => {
    return procrastinators.map(p => {
      const lat = p.location?.lat ?? (Math.random() * 180 - 90);
      const lng = p.location?.lng ?? (Math.random() * 360 - 180);
      
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lng + 180) * (Math.PI / 180);
      const radius = 2.02;
      
      const x = -(radius * Math.sin(phi) * Math.cos(theta));
      const z = (radius * Math.sin(phi) * Math.sin(theta));
      const y = (radius * Math.cos(phi));
      
      return { position: [x, y, z] as [number, number, number], data: p };
    });
  }, [procrastinators]);

  return (
    <>
      {points.map((point, i) => (
        <mesh 
          key={point.data.id} 
          position={point.position}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(point.data);
          }}
        >
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial 
            color={point.data.mood === "anxious" ? "#FF00FF" : "#FFF44F"} 
            transparent 
            opacity={0.8}
          />
          {/* Heatmap Glow Effect - Inner */}
          <mesh scale={[2.5, 2.5, 2.5]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color="#FF00FF" transparent opacity={0.2} />
          </mesh>
          {/* Heatmap Glow Effect - Outer (Softer) */}
          <mesh scale={[5, 5, 5]}>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color="#FF00FF" transparent opacity={0.05} />
          </mesh>
        </mesh>
      ))}
    </>
  );
}

function TransparentGlobe() {
  const meshRef = useRef<THREE.Mesh>(null);
  // Use useLoader for proper texture loading and caching
  const texture = useLoader(THREE.TextureLoader, 'https://threejs.org/examples/textures/land_ocean_ice_cloud_2048.jpg');
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.001;
    }
  });

  return (
    <group ref={meshRef}>
      <Sphere args={[2, 64, 64]}>
        <meshPhongMaterial 
          map={texture}
          color="#87CEEB" 
          transparent 
          opacity={0.3} 
          shininess={10}
        />
      </Sphere>
      <Sphere args={[1.99, 64, 64]}>
        <meshPhongMaterial 
          color="#FDFDFD" 
          transparent 
          opacity={0.1} 
          wireframe
        />
      </Sphere>
    </group>
  );
}

// --- Main App ---

export default function App() {
  const [socket, setSocket] = useState<any>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [view, setView] = useState<"feed" | "globe" | "mypage">("feed");
  const [procrastinators, setProcrastinators] = useState<Procrastinator[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedUser, setSelectedUser] = useState<Procrastinator | null>(null);
  
  // My Page Mock Data (In a real app, this would come from the server/auth)
  const myHistory = [
    { id: "h1", task: "寫期末報告", status: "completed", deadline: "2026-04-01", cheers: 12, habit: "剩 2 小時才開始" },
    { id: "h2", task: "洗碗", status: "abandoned", deadline: "2026-04-05", cheers: 2, habit: "直接放棄" },
    { id: "h3", task: "回覆老闆訊息", status: "ongoing", deadline: "2026-04-10", cheers: 5, habit: "拖延中" },
  ];
  
  // Form state
  const [name, setName] = useState("");
  const [mood, setMood] = useState<Mood>("anxious");
  const [task, setTask] = useState("");
  const [deadline, setDeadline] = useState("");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("initial_data", (data: { procrastinators: Procrastinator[], messages: Message[] }) => {
      setProcrastinators(data.procrastinators);
      setMessages(data.messages);
    });

    newSocket.on("user_joined", (user: Procrastinator) => {
      setProcrastinators((prev) => [...prev, user]);
    });

    newSocket.on("user_updated", (updatedUser: Procrastinator) => {
      setProcrastinators((prev) => 
        prev.map((u) => (u.id === updatedUser.id ? updatedUser : u))
      );
    });

    newSocket.on("user_left", (userId: string) => {
      setProcrastinators((prev) => prev.filter((u) => u.id !== userId));
    });

    newSocket.on("new_message", (msg: Message) => {
      setMessages((prev) => [...prev, msg].slice(-50));
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleGetLocation = () => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      }
    );
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !task || !deadline) return;

    const data = {
      name: name || "匿名拖延者",
      mood,
      task,
      deadline,
      location,
    };

    socket.emit("join", data);
    setIsJoined(true);
  };

  const handleSendMessage = (text: string, toUserName?: string) => {
    if (!socket || !text.trim()) return;

    socket.emit("send_message", {
      userId: socket.id,
      userName: name || "匿名拖延者",
      text: toUserName ? `@${toUserName} ${text}` : text,
    });
    setChatInput("");
    if (selectedUser) setSelectedUser(null);
  };

  const handleCheer = (userId: string) => {
    socket?.emit("cheer", userId);
  };

  if (!isJoined) {
    return (
      <div className="min-h-screen bg-[#FDFDFD] text-[#141414] font-sans p-6 flex flex-col items-center justify-center relative overflow-hidden">
        <DoodleStar className="absolute top-20 left-20 -rotate-12" />
        <DoodleCloud className="absolute top-40 right-40 rotate-6" />
        <DoodleCircle className="absolute bottom-40 left-40" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full z-10 relative"
        >
          <DoodleArrow className="absolute -top-10 -right-10 rotate-45" />
          <DoodleSquiggle className="absolute -bottom-10 -left-10" />
          
          <div className="text-center mb-12">
            <h1 className="text-7xl font-hand mb-2 text-magenta">Studio Procrastinate</h1>
            <p className="text-4xl font-display font-bold tracking-tight text-sky">Welcome!</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-8 bg-white p-8 border-2 border-black shadow-[16px_16px_0px_0px_rgba(255,244,79,0.5)]">
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold tracking-widest">Your Alias</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="匿名拖延者"
                  className="w-full border-b-2 border-black py-2 focus:outline-none focus:border-magenta transition-colors bg-transparent font-hand text-2xl"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-bold tracking-widest">Current Mood</label>
                <div className="flex flex-wrap gap-2">
                  {MOODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMood(m.value)}
                      className={cn(
                        "px-4 py-1 rounded-full border-2 text-xs font-bold transition-all",
                        mood === m.value 
                          ? "bg-black text-white border-black" 
                          : "border-black/20 hover:border-black"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold tracking-widest">What are you avoiding?</label>
                <textarea 
                  required
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="例如：寫期末報告、洗碗、回訊息..."
                  className="w-full border-b-2 border-black py-2 h-20 focus:outline-none focus:border-sky transition-colors bg-transparent resize-none font-hand text-2xl"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase font-bold tracking-widest">Deadline</label>
                <input 
                  required
                  type="datetime-local" 
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full border-b-2 border-black py-2 focus:outline-none focus:border-magenta transition-colors bg-transparent"
                />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={handleGetLocation}
                className={cn(
                  "text-[10px] uppercase font-bold tracking-widest self-start border-b-2 border-black pb-1",
                  location && "text-green-600 border-green-600"
                )}
              >
                {isLocating ? "定位中..." : location ? "✓ 位置已標記" : "標記我的位置"}
              </button>

              <button 
                type="submit"
                className="w-full bg-lemon text-black border-2 border-black font-display font-bold py-4 text-2xl hover:bg-yellow-300 transition-all active:scale-[0.98] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                Join the Club
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-[#141414] font-sans flex flex-col relative overflow-hidden">
      {/* Background Doodles */}
      <DoodleStar className="absolute top-40 left-10 opacity-10" />
      <DoodleCloud className="absolute bottom-20 right-20 opacity-10" />
      <DoodleArrow className="absolute top-1/2 left-4 -rotate-45 opacity-20" />
      <DoodleSquiggle className="absolute top-20 right-1/4 opacity-20" />
      
      {/* Header */}
      <header className="p-8 flex flex-col md:flex-row justify-between items-center gap-4 z-50">
        <div className="flex flex-col items-center md:items-start">
          <h1 className="text-5xl font-hand text-magenta">Studio Procrastinate</h1>
          <div className="flex items-center gap-2 text-[10px] uppercase font-bold tracking-widest opacity-40">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {procrastinators.length} People Avoiding Life
          </div>
        </div>
        
        <nav className="flex gap-4 items-center">
          <div className="flex bg-zinc-100 p-1 rounded-full border-2 border-black">
            <button 
              onClick={() => setView("feed")}
              className={cn(
                "px-4 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 transition-all",
                view === "feed" ? "bg-black text-white" : "hover:bg-black/5"
              )}
            >
              <LayoutList size={14} /> FEED
            </button>
            <button 
              onClick={() => setView("globe")}
              className={cn(
                "px-4 py-1 rounded-full text-[10px] font-bold flex items-center gap-2 transition-all",
                view === "globe" ? "bg-black text-white" : "hover:bg-black/5"
              )}
            >
              <GlobeIcon size={14} /> GLOBE
            </button>
          </div>
          
          <button 
            onClick={() => setView("mypage")}
            className={cn(
              "px-6 py-2 bg-lemon border-2 border-black rounded-full text-[10px] font-bold tracking-widest hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all",
              view === "mypage" && "bg-black text-white"
            )}
          >
            MY PAGE
          </button>
        </nav>
      </header>

      <main className="flex-1 px-8 pb-8 relative z-10">
        <AnimatePresence mode="wait">
          {view === "feed" ? (
            <motion.div 
              key="feed"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full"
            >
              {/* Left: Feed */}
              <div className="lg:col-span-8 space-y-8">
                <div className="border-b-4 border-black pb-2 flex items-center justify-between">
                  <h2 className="text-6xl font-display font-bold tracking-tighter text-sky">Live Feed</h2>
                  <Sparkles className="text-magenta animate-bounce" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <AnimatePresence mode="popLayout">
                    {procrastinators.map((p) => (
                      <ProcrastinatorCard 
                        key={p.id} 
                        data={p} 
                        onCheer={() => handleCheer(p.id)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right: Chat & Stats */}
              <div className="lg:col-span-4 space-y-8">
                <ChatBox 
                  messages={messages} 
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  onSendMessage={(text) => handleSendMessage(text)}
                  chatEndRef={chatEndRef}
                />
                <MoodStats procrastinators={procrastinators} />
              </div>
            </motion.div>
          ) : view === "globe" ? (
            <motion.div 
              key="globe"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="w-full h-[70vh] relative border-4 border-black bg-white shadow-[20px_20px_0px_0px_rgba(135,206,235,0.3)]"
            >
              <div className="absolute top-6 left-6 z-20">
                <h2 className="text-4xl font-hand text-magenta">Global Heatmap</h2>
                <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">點擊熱點查看逃避實況</p>
              </div>

              <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                <Suspense fallback={null}>
                  <TransparentGlobe />
                  <GlobePoints procrastinators={procrastinators} onSelect={setSelectedUser} />
                </Suspense>
                <OrbitControls enablePan={false} minDistance={3} maxDistance={10} />
              </Canvas>

              {/* Selected User Overlay */}
              <AnimatePresence>
                {selectedUser && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-md p-6"
                  >
                    <div className="bg-white border-4 border-black p-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative">
                      <button 
                        onClick={() => setSelectedUser(null)}
                        className="absolute top-4 right-4 hover:rotate-90 transition-transform"
                      >
                        <X size={20} />
                      </button>
                      
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-full border-2 border-black bg-lemon flex items-center justify-center">
                          {React.createElement(MOODS.find(m => m.value === selectedUser.mood)?.icon || Ghost, { size: 24 })}
                        </div>
                        <div>
                          <h3 className="text-2xl font-hand">{selectedUser.name}</h3>
                          <p className="text-[10px] font-bold uppercase text-magenta">{MOODS.find(m => m.value === selectedUser.mood)?.label}</p>
                        </div>
                      </div>

                      <p className="text-xl font-display font-bold mb-4">「{selectedUser.task}」</p>
                      
                      <div className="flex gap-2">
                        {["💪", "☕️", "加油！", "我也在拖延"].map(emoji => (
                          <button 
                            key={emoji}
                            onClick={() => handleSendMessage(emoji, selectedUser.name)}
                            className="px-3 py-1 border-2 border-black rounded-full text-sm hover:bg-lemon transition-colors font-hand"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            <motion.div
              key="mypage"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto w-full space-y-12"
            >
              {/* Profile Header */}
              <div className="border-4 border-black bg-white p-8 shadow-[16px_16px_0px_0px_rgba(255,244,79,0.5)] relative">
                <DoodleStar className="absolute -top-6 -right-6 rotate-12" />
                <div className="flex flex-col md:flex-row gap-8 items-center md:items-start">
                  <div className="w-32 h-32 rounded-full border-4 border-black bg-sky flex items-center justify-center text-6xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    🐢
                  </div>
                  <div className="flex-1 space-y-4 text-center md:text-left">
                    <div>
                      <h2 className="text-5xl font-hand text-magenta">{name || "匿名拖延者"}</h2>
                      <p className="text-xs font-bold uppercase tracking-widest opacity-40 flex items-center justify-center md:justify-start gap-2">
                        <MapPin size={12} /> {location ? `${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}` : "地球某處"}
                      </p>
                    </div>
                    <div className="bg-zinc-50 p-4 border-2 border-black/5 rounded-xl italic font-hand text-2xl">
                      「明天的事明天再說，後天的事...再看看。」
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                      {["☕️", "🛌", "📱", "🎮"].map((emoji, i) => (
                        <button key={i} className="w-10 h-10 border-2 border-black rounded-full bg-white hover:bg-lemon transition-all flex items-center justify-center text-xl">
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats & History */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-8">
                  <div className="border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(135,206,235,0.5)]">
                    <h3 className="text-xs font-bold uppercase tracking-widest mb-4 border-b-2 border-black pb-2">拖延習慣分析</h3>
                    <ul className="space-y-4 font-hand text-xl">
                      <li className="flex justify-between">
                        <span>平均開始時間</span>
                        <span className="text-magenta">剩 2.5 小時</span>
                      </li>
                      <li className="flex justify-between">
                        <span>最常放棄類型</span>
                        <span className="text-sky">家事、運動</span>
                      </li>
                      <li className="flex justify-between">
                        <span>拖延戰鬥力</span>
                        <span className="text-lemon">Lv. 99</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <h3 className="text-4xl font-display font-bold text-sky border-b-4 border-black pb-2">拖延歷程</h3>
                  <div className="space-y-4">
                    {myHistory.map(item => (
                      <div key={item.id} className="border-2 border-black bg-white p-4 flex justify-between items-center hover:translate-x-2 transition-transform shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-2 h-2 rounded-full",
                              item.status === "completed" ? "bg-green-500" : item.status === "abandoned" ? "bg-red-500" : "bg-yellow-500"
                            )} />
                            <h4 className="font-bold text-lg">「{item.task}」</h4>
                          </div>
                          <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                            {item.deadline} • {item.habit}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <div className="text-xs font-bold">{item.cheers}</div>
                            <div className="text-[8px] opacity-40 uppercase">Cheers</div>
                          </div>
                          <div className={cn(
                            "px-3 py-1 border-2 border-black rounded-full text-[10px] font-bold uppercase",
                            item.status === "completed" ? "bg-green-100" : item.status === "abandoned" ? "bg-red-100" : "bg-yellow-100"
                          )}>
                            {item.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="p-8 border-t border-black/10 text-center">
        <p className="text-5xl font-hand opacity-20">Studio Procrastinate</p>
      </footer>
    </div>
  );
}

// --- Sub-components ---

function ChatBox({ messages, chatInput, setChatInput, onSendMessage, chatEndRef }: any) {
  return (
    <div className="border-4 border-black bg-white p-6 shadow-[12px_12px_0px_0px_rgba(255,0,255,0.1)] flex flex-col h-[500px]">
      <div className="flex items-center gap-2 border-b-2 border-black pb-4 mb-4">
        <MessageSquare size={18} />
        <h3 className="text-xs uppercase font-bold tracking-widest">互助對話框</h3>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2 custom-scrollbar">
        {messages.map((msg: any) => (
          <div key={msg.id} className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold">{msg.userName}</span>
              <span className="text-[8px] opacity-30">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="bg-zinc-50 p-3 border-2 border-black/5 text-xs rounded-lg font-hand text-lg">
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); onSendMessage(chatInput); }} className="flex gap-2">
        <input 
          type="text" 
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="說點鼓勵的話..."
          className="flex-1 border-b-2 border-black py-2 text-sm focus:outline-none focus:border-sky bg-transparent font-hand text-xl"
        />
        <button 
          type="submit"
          className="p-2 hover:text-magenta transition-colors"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

function MoodStats({ procrastinators }: { procrastinators: Procrastinator[] }) {
  return (
    <div className="border-4 border-black bg-white p-6 shadow-[12px_12px_0px_0px_rgba(255,244,79,0.2)]">
      <h3 className="text-xs uppercase font-bold tracking-widest mb-6 border-b-2 border-black pb-2">Mood Stats</h3>
      <div className="space-y-4">
        {MOODS.map(m => {
          const count = procrastinators.filter(p => p.mood === m.value).length;
          const percentage = procrastinators.length > 0 ? (count / procrastinators.length) * 100 : 0;
          return (
            <div key={m.value} className="space-y-1">
              <div className="flex justify-between text-[10px] font-bold">
                <span>{m.label}</span>
                <span>{count}</span>
              </div>
              <div className="h-3 bg-zinc-100 w-full border-2 border-black">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  className={cn("h-full", m.value === "anxious" ? "bg-magenta" : m.value === "chill" ? "bg-sky" : "bg-lemon")}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProcrastinatorCard({ data, onCheer }: { data: Procrastinator; onCheer: () => void; key?: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const moodInfo = MOODS.find(m => m.value === data.mood) || MOODS[0];

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const deadline = new Date(data.deadline).getTime();
      const diff = deadline - now;

      if (diff > 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      } else {
        setTimeLeft("EXPIRED");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [data.deadline]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="border-4 border-black bg-white p-6 flex flex-col gap-4 relative shadow-[8px_8px_0px_0px_rgba(0,0,0,0.05)] hover:shadow-[12px_12px_0px_0px_rgba(0,0,0,0.1)] transition-all"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className={cn("w-12 h-12 rounded-full border-2 border-black flex items-center justify-center", moodInfo.bg)}>
            <moodInfo.icon size={24} className={moodInfo.color} />
          </div>
          <div>
            <h4 className="text-2xl font-hand leading-none">{data.name}</h4>
            <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{moodInfo.label}</p>
          </div>
        </div>
        <div className="bg-black text-white px-2 py-1 text-[8px] font-bold tracking-widest rounded">
          LIVE
        </div>
      </div>

      <div className="py-2">
        <p className="text-3xl font-display font-bold leading-tight tracking-tighter text-sky">
          「{data.task}」
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t-2 border-black pt-4">
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-widest opacity-30 flex items-center gap-1">
            <Clock size={10} /> Deadline
          </div>
          <div className={cn("text-xs font-bold", timeLeft === "EXPIRED" ? "text-magenta" : "text-black")}>
            {timeLeft}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[9px] font-bold uppercase tracking-widest opacity-30 flex items-center gap-1">
            <MapPin size={10} /> Location
          </div>
          <div className="text-xs font-bold truncate">
            {data.location ? `${data.location.lat.toFixed(2)}, ${data.location.lng.toFixed(2)}` : "Somewhere"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-2">
        <button 
          onClick={onCheer}
          className="flex-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest border-2 border-black rounded-full py-2 bg-lemon hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all active:scale-95"
        >
          <Heart size={12} className={cn(data.cheers > 0 && "fill-current")} />
          加油 ({data.cheers})
        </button>
        <button 
          onClick={onCheer}
          className="flex-1 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest border-2 border-black rounded-full py-2 bg-sky hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all active:scale-95"
        >
          <Zap size={12} />
          督促
        </button>
      </div>
    </motion.div>
  );
}

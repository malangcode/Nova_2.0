import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Brain, Search, Trash2, Clock, Database, Sparkles, BookOpen, ListFilter } from "lucide-react";
import { cn } from "../lib/utils";
import { ConfirmModal } from "../components/ConfirmModal";
import { getLongTermSummary } from "../services/geminiService";
import Markdown from "react-markdown";

interface Memory {
  id: number;
  content: string;
  timestamp: string;
  type: 'short-term' | 'long-term';
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'short-term' | 'long-term'>('short-term');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [memRes, sumData] = await Promise.all([
        fetch('/api/memory/list'),
        getLongTermSummary()
      ]);
      const memData = await memRes.json();
      setMemories(Array.isArray(memData) ? memData : []);
      setSummary(sumData);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredMemories = memories.filter(m => 
    m.type === activeTab &&
    m.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      const res = await fetch(`/api/memory/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories(prev => prev.filter(m => m.id !== deleteId));
      }
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
    setDeleteId(null);
  };

  return (
    <div className="max-w-6xl mx-auto p-6 lg:p-12 space-y-12">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-emerald-400">
          <Brain size={32} />
          <span className="text-sm font-bold uppercase tracking-[0.3em]">Neural Core Architecture</span>
        </div>
        <h1 className="text-5xl font-black tracking-tighter">Memory summary up to now</h1>
        <p className="text-white/40 text-xl font-medium">What NOVA knows about the user</p>
      </div>

      {/* Neural Core Summary (Story Memory) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative group"
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 rounded-[2.5rem] blur-2xl opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
        <div className="relative bg-[#0D0D0D] border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-2xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <BookOpen size={20} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">The Story Memory</h2>
          </div>
          
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-4 bg-white/5 rounded w-full" />
              <div className="h-4 bg-white/5 rounded w-5/6" />
              <div className="h-4 bg-white/5 rounded w-4/6" />
            </div>
          ) : summary ? (
            <div className="prose prose-invert prose-emerald max-w-none">
              <div className="markdown-body text-white/70 leading-relaxed text-lg italic">
                <Markdown>{summary}</Markdown>
              </div>
            </div>
          ) : (
            <p className="text-white/20 italic">No narrative summary formed yet. Nova is still observing...</p>
          )}
        </div>
      </motion.div>

      {/* Memory Systems Tabs */}
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex bg-white/5 p-1.5 rounded-2xl border border-white/10 w-fit">
            <button
              onClick={() => setActiveTab('short-term')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
                activeTab === 'short-term' ? "bg-emerald-500 text-black shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Short-Term Core
            </button>
            <button
              onClick={() => setActiveTab('long-term')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
                activeTab === 'long-term' ? "bg-emerald-500 text-black shadow-lg" : "text-white/40 hover:text-white"
              )}
            >
              Long-Term Core
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-emerald-500 transition-colors" size={18} />
            <input 
              type="text"
              placeholder={`Search ${activeTab === 'short-term' ? 'observations' : 'facts'}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-2xl pl-12 pr-6 py-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-full md:w-80 transition-all placeholder:text-white/20 text-sm"
            />
          </div>
        </div>

        {/* Memory Description */}
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-6 flex items-start gap-4">
          <div className="mt-1 text-emerald-500">
            {activeTab === 'short-term' ? <Clock size={20} /> : <ListFilter size={20} />}
          </div>
          <div>
            <h3 className="font-bold text-emerald-400 text-sm uppercase tracking-wider mb-1">
              {activeTab === 'short-term' ? "Short-Term Memory (Neural Core)" : "Long-Term Memory (Hard Core)"}
            </h3>
            <p className="text-white/40 text-sm leading-relaxed">
              {activeTab === 'short-term' 
                ? "Tiny observations, mood changes, and casual interests captured like a diary. Nova searches this first for nuanced context."
                : "Structured facts, long-term projects, and core identity information. Nova deep dives here for permanent knowledge."}
            </p>
          </div>
        </div>

        {/* Memories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={`skeleton-${i}`} className="h-40 bg-white/5 rounded-3xl border border-white/10 animate-pulse" />
              ))
            ) : filteredMemories.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full text-center py-20 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10"
              >
                <Database size={40} className="mx-auto mb-4 text-white/10" />
                <h3 className="text-lg font-semibold text-white/40">No {activeTab === 'short-term' ? 'observations' : 'facts'} found</h3>
              </motion.div>
            ) : (
              filteredMemories.map((memory, i) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={memory.id}
                  className="group relative bg-white/5 border border-white/10 rounded-3xl p-6 hover:bg-white/[0.08] hover:border-emerald-500/30 transition-all"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-tighter text-white/30">
                      <Clock size={12} />
                      {new Date(memory.timestamp).toLocaleString()}
                    </div>
                    <div className={cn(
                      "w-2 h-2 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]",
                      activeTab === 'short-term' ? "bg-emerald-500" : "bg-teal-400"
                    )} />
                  </div>
                  
                  <p className="text-white/70 text-sm leading-relaxed mb-6 italic">
                    "{memory.content}"
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-t-white/5">
                    <div className="flex items-center gap-2 text-emerald-400/60">
                      <Sparkles size={14} />
                      <span className="text-[10px] font-bold uppercase">Stored Pattern</span>
                    </div>
                    <button 
                      onClick={() => setDeleteId(memory.id)}
                      className="p-2 text-white/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>

      <ConfirmModal 
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Erase Neural Pattern?"
        message="This specific memory will be permanently removed from Nova's long-term core. This action cannot be undone."
        confirmText="Erase Memory"
      />
    </div>
  );
}

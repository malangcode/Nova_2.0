import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Camera, User, Box, Trash2, Calendar, 
  Search, Filter, RefreshCw, ChevronRight,
  UserPlus, Package
} from "lucide-react";
import { cn } from "../lib/utils";
import { listVisualMemories, deleteVisualMemory, clearVisualMemories, VisualMemory } from "../services/geminiService";
import { ConfirmModal } from "../components/ConfirmModal";

export default function VisualMemoryPage() {
  const [memories, setMemories] = useState<VisualMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<'all' | 'person' | 'object'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedMemory, setSelectedMemory] = useState<VisualMemory | null>(null);

  const fetchMemories = async () => {
    setIsLoading(true);
    try {
      const data = await listVisualMemories();
      setMemories(data);
    } catch (err) {
      console.error("Failed to fetch visual memories:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleDelete = async (id: number) => {
    try {
      await deleteVisualMemory(id);
      setMemories(prev => prev.filter(m => m.id !== id));
      if (selectedMemory?.id === id) setSelectedMemory(null);
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearVisualMemories();
      setMemories([]);
      setSelectedMemory(null);
      setShowClearConfirm(false);
    } catch (err) {
      console.error("Failed to clear memories:", err);
    }
  };

  const filteredMemories = memories.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         m.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === 'all' || m.type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-10">
      <ConfirmModal 
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearAll}
        title="Clear Visual Memory?"
        message="This will permanently delete all recognized faces and objects. Nova will no longer recognize anyone or anything she has learned visually."
        confirmText="Clear All"
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-emerald-400">
            <Camera size={24} />
            <span className="text-xs font-bold uppercase tracking-[0.3em]">Neural Vision</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Visual Memory</h1>
          <p className="text-white/50 max-w-xl">
            Manage identities and objects Nova has learned to recognize through her camera.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={fetchMemories}
            className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
            title="Refresh"
          >
            <RefreshCw size={20} className={cn(isLoading && "animate-spin")} />
          </button>
          <button 
            onClick={() => setShowClearConfirm(true)}
            className="px-5 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-all font-medium text-sm"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
          <input 
            type="text"
            placeholder="Search identities or objects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
          />
        </div>
        <div className="flex bg-white/5 border border-white/10 rounded-2xl p-1">
          {(['all', 'person', 'object'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all",
                filterType === type ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white/60"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Memory List */}
        <div className="lg:col-span-7 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 opacity-20">
              <RefreshCw size={40} className="animate-spin" />
              <p className="text-sm uppercase tracking-widest font-bold">Loading Neural Core...</p>
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4 bg-white/5 border border-dashed border-white/10 rounded-3xl">
              <div className="p-4 rounded-full bg-white/5">
                <Camera size={32} className="text-white/20" />
              </div>
              <p className="text-white/40 font-medium">No visual memories found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredMemories.map((memory) => (
                <motion.div
                  layoutId={`memory-${memory.id}`}
                  key={memory.id}
                  onClick={() => setSelectedMemory(memory)}
                  className={cn(
                    "group relative p-4 rounded-3xl border transition-all cursor-pointer",
                    selectedMemory?.id === memory.id 
                      ? "bg-emerald-500/10 border-emerald-500/30" 
                      : "bg-white/5 border-white/10 hover:border-white/20"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 rounded-2xl overflow-hidden bg-black/40 border border-white/10">
                      <img 
                        src={memory.image_snapshot} 
                        alt={memory.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {memory.type === 'person' ? (
                          <User size={12} className="text-emerald-400" />
                        ) : (
                          <Box size={12} className="text-blue-400" />
                        )}
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                          {memory.type}
                        </span>
                      </div>
                      <h3 className="font-bold text-lg truncate">{memory.name}</h3>
                      <p className="text-sm text-white/40 truncate">{memory.description}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="hidden md:block text-right">
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-1">Detected</p>
                        <p className="text-xs text-white/40">{new Date(memory.timestamp).toLocaleDateString()}</p>
                      </div>
                      <ChevronRight size={20} className={cn(
                        "transition-all",
                        selectedMemory?.id === memory.id ? "text-emerald-400 translate-x-1" : "text-white/10"
                      )} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* Details Panel */}
        <div className="lg:col-span-5">
          <div className="sticky top-24">
            <AnimatePresence mode="wait">
              {selectedMemory ? (
                <motion.div
                  key={selectedMemory.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col"
                >
                  <div className="aspect-video relative overflow-hidden bg-black">
                    <img 
                      src={selectedMemory.image_snapshot} 
                      alt={selectedMemory.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                    
                    <div className="absolute bottom-6 left-6 right-6">
                      <div className="flex items-center gap-3 mb-2">
                        <div className={cn(
                          "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2",
                          selectedMemory.type === 'person' ? "bg-emerald-500/20 text-emerald-400" : "bg-blue-500/20 text-blue-400"
                        )}>
                          {selectedMemory.type === 'person' ? <UserPlus size={12} /> : <Package size={12} />}
                          {selectedMemory.type}
                        </div>
                        <div className="px-3 py-1 rounded-full bg-white/10 text-white/60 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                          <Calendar size={12} />
                          {new Date(selectedMemory.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                      <h2 className="text-3xl font-bold">{selectedMemory.name}</h2>
                    </div>
                  </div>

                  <div className="p-8 space-y-8">
                    <div className="space-y-3">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Description</h4>
                      <p className="text-white/70 leading-relaxed">
                        {selectedMemory.description}
                      </p>
                    </div>

                    {selectedMemory.type === 'person' && selectedMemory.face_embedding && (
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Biometric Data</h4>
                        <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                            <RefreshCw size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-emerald-400">Face Embedding Stored</p>
                            <p className="text-[10px] text-emerald-400/50 uppercase tracking-widest">768-dimensional vector</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                      <button 
                        onClick={() => handleDelete(selectedMemory.id)}
                        className="flex items-center gap-2 text-red-500/60 hover:text-red-500 transition-colors text-sm font-medium"
                      >
                        <Trash2 size={18} />
                        Delete Identity
                      </button>
                      <button 
                        onClick={() => setSelectedMemory(null)}
                        className="text-white/30 hover:text-white transition-colors text-sm font-medium"
                      >
                        Close Details
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="h-[500px] flex flex-col items-center justify-center space-y-6 bg-white/[0.02] border border-dashed border-white/5 rounded-[2.5rem] text-center p-10">
                  <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-white/10">
                    <Search size={32} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-bold text-white/40">No Identity Selected</h3>
                    <p className="text-sm text-white/20 max-w-xs">
                      Select a visual memory from the list to view biometric details and snapshots.
                    </p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

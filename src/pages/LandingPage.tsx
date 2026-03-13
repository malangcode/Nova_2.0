import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Sparkles, Camera, Mic, Brain, ArrowRight, Activity } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center space-y-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-6 max-w-3xl"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold tracking-widest uppercase mb-4">
          <Activity size={16} />
          Next-Gen AI Interface
        </div>
        
        <h1 className="text-6xl lg:text-8xl font-black tracking-tighter leading-[0.9] text-white">
          SEE. HEAR.<br />
          <span className="text-emerald-500">REMEMBER.</span>
        </h1>
        
        <p className="text-xl text-white/40 max-w-2xl mx-auto leading-relaxed">
          VisionVoice is a multimodal AI assistant that bridges the gap between digital intelligence and physical reality.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-8">
          <Link 
            to="/assistant"
            className="px-8 py-4 bg-emerald-500 text-black font-bold rounded-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 text-lg"
          >
            Launch Assistant <ArrowRight size={20} />
          </Link>
          <Link 
            to="/history"
            className="px-8 py-4 bg-white/5 border border-white/10 text-white font-bold rounded-2xl hover:bg-white/10 transition-all text-lg"
          >
            View History
          </Link>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
        {[
          { icon: Camera, title: "Vision", desc: "Real-time environment analysis through your camera." },
          { icon: Mic, title: "Voice", desc: "Natural voice conversations with low-latency responses." },
          { icon: Brain, title: "Memory", desc: "Long-term context retention using vector embeddings." }
        ].map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 + i * 0.1 }}
            className="p-8 bg-white/5 border border-white/10 rounded-[32px] text-left space-y-4 hover:border-emerald-500/30 transition-colors group"
          >
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
              <feature.icon size={24} />
            </div>
            <h3 className="text-xl font-bold">{feature.title}</h3>
            <p className="text-white/40 text-sm leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WebRTCManager } from "@/lib/webrtc";
import { useAppStore } from "@/store/useAppStore";

export default function ManualPage() {
	// Very minimal placeholder UI: we'll wire full manual pairing later
	const [mode, setMode] = useState<"host"|"guest">("host");
		const [localSdp] = useState("");
	const [remoteSdp, setRemoteSdp] = useState("");
	const rtcRef = useRef<WebRTCManager | null>(null);
	const { nickname } = useAppStore();

	useEffect(() => {
		if (!rtcRef.current) rtcRef.current = new WebRTCManager("manual", nickname || "Guest");
	}, [nickname]);

	return (
		<div className="min-h-screen bg-gradient-to-b from-[#0b1220] to-[#0f172a] text-white px-4 py-6">
			<div className="mx-auto max-w-3xl">
				<h1 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-fuchsia-400">Manual Pairing</h1>
				<p className="text-white/70 mt-1">Connect two devices without a signaling server by exchanging SDPs manually.</p>

				<div className="mt-6 flex gap-3">
					<button onClick={() => setMode("host")} className={`px-3 py-1.5 rounded-md border ${mode==='host'?'bg-white/15':'bg-white/5'} border-white/10`}>Host</button>
					<button onClick={() => setMode("guest")} className={`px-3 py-1.5 rounded-md border ${mode==='guest'?'bg-white/15':'bg-white/5'} border-white/10`}>Guest</button>
				</div>

				<div className="mt-6 grid md:grid-cols-2 gap-4">
					<div>
						<h2 className="text-sm uppercase tracking-widest text-white/60">Your SDP</h2>
						<textarea className="mt-2 w-full h-40 rounded-md bg-white/10 border border-white/10 p-2 text-sm" value={localSdp} readOnly />
					</div>
					<div>
						<h2 className="text-sm uppercase tracking-widest text-white/60">Remote SDP</h2>
						<textarea className="mt-2 w-full h-40 rounded-md bg-white/10 border border-white/10 p-2 text-sm" value={remoteSdp} onChange={(e)=>setRemoteSdp(e.target.value)} />
					</div>
				</div>

				<div className="mt-4 flex gap-2">
					<button className="px-4 py-2 rounded-md bg-cyan-500 text-black text-sm">Generate Offer</button>
					<button className="px-4 py-2 rounded-md bg-white/10 border border-white/10 text-sm">Apply Remote</button>
				</div>

						<div className="mt-8">
							<Link href="/" className="text-cyan-300 hover:underline">← Back to Home</Link>
						</div>
			</div>
		</div>
	);
}


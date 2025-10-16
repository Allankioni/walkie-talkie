"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WebRTCManager } from "@/lib/webrtc";
import { useAppStore } from "@/store/useAppStore";
import { packSignal, unpackSignal } from "@/lib/manualSignal";
import QRCode from "qrcode";
import QRScanner from "@/components/QRScanner";

export default function ManualPage() {
	const [mode, setMode] = useState<"host" | "guest">("host");
	const [qrDataUrl, setQrDataUrl] = useState<string>("");
	const [packedText, setPackedText] = useState<string>("");
		const [remotePacked, setRemotePacked] = useState<string>("");
		const [scanning, setScanning] = useState(false);
	const rtcRef = useRef<WebRTCManager | null>(null);
	const { nickname } = useAppStore();

		useEffect(() => {
			if (!rtcRef.current) rtcRef.current = new WebRTCManager("manual", nickname || "Guest", false);
		}, [nickname]);

	const renderQR = async (text: string) => {
		try {
			const url = await QRCode.toDataURL(text, { margin: 1, scale: 6 });
			setQrDataUrl(url);
			setPackedText(text);
		} catch (e) {
			console.error(e);
			alert("Failed to generate QR");
		}
	};

	const generateOffer = async () => {
		try {
			const offer = await rtcRef.current!.createOfferManual();
			await renderQR(packSignal(offer));
		} catch (e) {
			console.error(e);
			alert(String(e));
		}
	};

	const applyRemote = async () => {
		try {
			const payload = unpackSignal(remotePacked.trim());
			if (payload.t === 'offer') {
				// guest flow: accept offer -> generate answer -> show to host
				const answer = await rtcRef.current!.acceptOfferManual(payload);
				await renderQR(packSignal(answer));
			} else if (payload.t === 'answer') {
				// host flow: apply answer -> done
				await rtcRef.current!.applyAnswerManual(payload);
				alert('Connected (answer applied). Start talking!');
			} else {
				alert('Unknown payload type');
			}
		} catch (e) {
			console.error(e);
			alert(String(e));
		}
	};

	return (
		<div className="min-h-screen bg-gradient-to-b from-[#0b1220] to-[#0f172a] text-white px-4 py-6">
			<div className="mx-auto max-w-3xl">
				<h1 className="text-2xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-fuchsia-400">Manual Pairing (QR)</h1>
				<p className="text-white/70 mt-1">Connect two devices without a signaling server by exchanging a QR code between them.</p>

				<div className="mt-6 flex gap-3">
					<button onClick={() => setMode("host")} className={`px-3 py-1.5 rounded-md border ${mode === 'host' ? 'bg-white/15' : 'bg-white/5'} border-white/10`}>Host</button>
					<button onClick={() => setMode("guest")} className={`px-3 py-1.5 rounded-md border ${mode === 'guest' ? 'bg-white/15' : 'bg-white/5'} border-white/10`}>Guest</button>
				</div>

				<div className="mt-6 grid md:grid-cols-2 gap-4">
					<div>
						<h2 className="text-sm uppercase tracking-widest text-white/60">Your QR / Payload</h2>
						{qrDataUrl ? (
							<div className="mt-2 flex flex-col items-center gap-2">
								<div className="flex h-56 w-56 items-center justify-center overflow-hidden rounded bg-white p-2">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img src={qrDataUrl} alt="Pairing QR" className="h-full w-full object-contain" />
								</div>
								<textarea className="w-full h-28 rounded-md bg-white/10 border border-white/10 p-2 text-xs break-all" value={packedText} readOnly />
							</div>
						) : (
							<div className="mt-2 text-white/60 text-sm">No QR yet. Generate one below.</div>
						)}
					</div>
					<div>
						<h2 className="text-sm uppercase tracking-widest text-white/60">Paste Remote Payload</h2>
						<textarea className="mt-2 w-full h-56 rounded-md bg-white/10 border border-white/10 p-2 text-sm" value={remotePacked} onChange={(e) => setRemotePacked(e.target.value)} placeholder="wt://..." />
					</div>
				</div>

				<div className="mt-4 flex flex-wrap gap-2">
					{mode === 'host' ? (
						<>
							<button className="px-4 py-2 rounded-md bg-cyan-500 text-black text-sm" onClick={generateOffer}>Generate Offer (QR)</button>
							<button className="px-4 py-2 rounded-md bg-white/10 border border-white/10 text-sm" onClick={applyRemote}>Apply Answer</button>
									<button className="px-4 py-2 rounded-md bg-white/10 border border-white/10 text-sm" onClick={() => setScanning(true)}>Scan Answer QR</button>
						</>
					) : (
						<>
									<button className="px-4 py-2 rounded-md bg-white/10 border border-white/10 text-sm" onClick={applyRemote}>Accept Offer → Show Answer QR</button>
									<button className="px-4 py-2 rounded-md bg-white/10 border border-white/10 text-sm" onClick={() => setScanning(true)}>Scan Offer QR</button>
						</>
					)}
					<button className="px-4 py-2 rounded-md bg-white/10 border border-white/10 text-sm" onClick={() => { setQrDataUrl(''); setPackedText(''); setRemotePacked(''); }}>Reset</button>
				</div>

						{scanning && (
							<QRScanner
								onDecode={(text) => { setRemotePacked(text); setScanning(false); }}
								onClose={() => setScanning(false)}
								hint={mode === 'host' ? 'Scan the Guest\'s Answer QR' : 'Scan the Host\'s Offer QR'}
							/>
						)}

				<div className="mt-8">
					<Link href="/" className="text-cyan-300 hover:underline">← Back to Home</Link>
				</div>
			</div>
		</div>
	);
}


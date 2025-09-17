export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#0b1220] text-white flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">You are offline</h1>
        <p className="mt-2 text-white/70">
          The app will reconnect automatically when you are back online. Some features like presence and signaling require a network connection.
        </p>
      </div>
    </div>
  );
}

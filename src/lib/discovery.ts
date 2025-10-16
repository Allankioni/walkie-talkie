type Protocol = 'http' | 'https';

export type HubDiscoveryResult = {
	url: string;
	latencyMs: number;
	status?: string;
	users?: number;
};

export type DiscoverOptions = {
	storedUrl?: string;
	extraHosts?: string[];
	ports?: number[];
	protocols?: Protocol[];
	timeoutMs?: number;
	maxHostsPerSubnet?: number;
};

const DEFAULT_PORTS = [41234];
const COMMON_SUBNETS = ['192.168.0', '192.168.1', '192.168.43', '10.0.0'];
const DEFAULT_LAST_OCTETS = [1, 2, 5, 10, 15, 20, 25, 50, 75, 100];

function parseHostFromUrl(url?: string | null): { host?: string; port?: number; protocol?: Protocol } {
	if (!url) return {};
	try {
		if (url === '/') return {};
		const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
		const port = parsed.port ? Number(parsed.port) : undefined;
		const protocol = parsed.protocol.replace(':', '') as Protocol;
		return { host: parsed.hostname, port, protocol };
	} catch {
		return {};
	}
}

function buildSubnetBases(host?: string): string[] {
	if (!host) return [];
	const parts = host.split('.');
	if (parts.length !== 4) return [];
	return [parts.slice(0, 3).join('.')];
}

function unique<T>(value: T[], keyGetter: (item: T) => string): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of value) {
		const key = keyGetter(item);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(item);
	}
	return result;
}

function buildHostCandidates(options: DiscoverOptions = {}): { host: string; portHints: number[] }[] {
	const { storedUrl, extraHosts, ports, maxHostsPerSubnet } = options;
	const hints: { host: string; portHints: number[] }[] = [];

	const { host: storedHost } = parseHostFromUrl(storedUrl);
	const locationHost = typeof window !== 'undefined' ? window.location.hostname : undefined;

	const portCandidates = unique((ports && ports.length > 0 ? ports : DEFAULT_PORTS).filter((p): p is number => Number.isFinite(p)), (p) => String(p));

	const subnetBases = new Set<string>();
	buildSubnetBases(storedHost).forEach((b) => subnetBases.add(b));
	buildSubnetBases(locationHost).forEach((b) => subnetBases.add(b));
	COMMON_SUBNETS.forEach((b) => subnetBases.add(b));

	const maxHosts = Math.max(3, maxHostsPerSubnet ?? 10);
	const octets = DEFAULT_LAST_OCTETS.slice(0, maxHosts);

	for (const base of subnetBases) {
		for (const oct of octets) {
			hints.push({ host: `${base}.${oct}`, portHints: [...portCandidates] });
		}
	}

		const additionalHosts = extraHosts || [];
	for (const host of additionalHosts) {
		if (!host) continue;
		hints.push({ host, portHints: [...portCandidates] });
	}

	if (storedHost) {
		hints.unshift({ host: storedHost, portHints: [...portCandidates] });
	}

	return unique(hints, (item) => `${item.host}|${item.portHints.join(',')}`);
}

async function pingHub(url: string, timeoutMs: number): Promise<HubDiscoveryResult | null> {
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
	try {
		const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
		const response = await fetch(`${url.replace(/\/$/, '')}/health`, {
			method: 'GET',
			mode: 'cors',
			cache: 'no-store',
			signal: controller?.signal,
		});
		if (!response.ok) return null;
		const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
		let data: { status?: string; users?: number } | null = null;
		try {
			data = await response.json();
		} catch {
			data = null;
		}
		return {
			url: url.replace(/\/$/, ''),
			latencyMs: Math.round(elapsed),
			status: data?.status,
			users: data?.users,
		};
	} catch {
		return null;
	} finally {
		if (timer) clearTimeout(timer);
	}
}

function buildUrlCombos(hostEntries: { host: string; portHints: number[] }[], protocols: Protocol[]): string[] {
	const urls: string[] = [];
	for (const entry of hostEntries) {
		const { host, portHints } = entry;
		for (const protocol of protocols) {
			const defaultPort = protocol === 'https' ? 443 : 80;
			const portsToTry = portHints.length > 0 ? portHints : [defaultPort];
			for (const port of portsToTry) {
				if (typeof port === 'number' && port > 0) {
					if (port === defaultPort) {
						urls.push(`${protocol}://${host}`);
					} else {
						urls.push(`${protocol}://${host}:${port}`);
					}
				}
			}
		}
	}
	return unique(urls, (u) => u);
}

async function runWithConcurrency(urls: string[], timeoutMs: number, concurrency: number): Promise<HubDiscoveryResult[]> {
	const results: HubDiscoveryResult[] = [];
	let index = 0;
	const worker = async () => {
		while (index < urls.length) {
			const currentIndex = index;
			index += 1;
			const url = urls[currentIndex];
			const res = await pingHub(url, timeoutMs);
			if (res) results.push(res);
		}
	};
	const workers = Array.from({ length: Math.min(concurrency, urls.length) }, worker);
	await Promise.all(workers);
	results.sort((a, b) => a.latencyMs - b.latencyMs);
	return results;
}

export async function discoverSignalHubs(options: DiscoverOptions = {}): Promise<HubDiscoveryResult[]> {
	const timeoutMs = options.timeoutMs ?? 1800;
	const pageProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
	const protocolPreference = options.protocols || (pageProtocol === 'https:' ? ['https', 'http'] : ['http', 'https']);
	const hostEntries = buildHostCandidates(options);
	if (hostEntries.length === 0) return [];
	const urls = buildUrlCombos(hostEntries, protocolPreference);
	if (urls.length === 0) return [];
	const results = await runWithConcurrency(urls, timeoutMs, 6);
	return unique(results, (item) => item.url);
}
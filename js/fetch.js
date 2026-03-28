import { setServerInfo, setTitle } from './server.js';
import { getDiscordId, getSteamId } from './utils/user.js';
import { getFiveMId } from './utils/user.js';
import { getPlayerAvatarUrl } from './utils/user.js';
import { isSearching, searchPlayers, checkPendingSearch } from './search.js';
import { API_BASE_URL, DEFAULT_HEADERS } from './utils/constants.js';
import { updateActivePlayers, isPlayerFavorite } from './favorites.js';
import { getPlayerKey } from './favorites.js'; // Ajouté pour générer la clé stable

const refreshButton = document.querySelector('#refresh-button');
const loader = document.querySelector('#loader');
const table = document.querySelector('table');
const refreshTimer = document.querySelector('#refresh-timer');

let currentPlayers;
let fetcher;
let seconds = 30;
const playerJoinTimes = new Map();
let joinTimer;
let hasCapturedInitialSnapshot = false;
let activeServerId;

export const getPlayers = () => currentPlayers;

export const fetchServer = (serverId) => {
	try {
		if (!isValidServerId(serverId)) {
			showNotification('Invalid server ID format', 'error');
			return;
		}

		if (activeServerId !== serverId) {
			activeServerId = serverId;
			playerJoinTimes.clear();
			hasCapturedInitialSnapshot = false;
			currentPlayers = undefined;
		}

		setTitle('Loading server data from FiveM API...');
		seconds = 30;

		showLoader(true);

		refreshButton.onclick = () => fetchServer(serverId);
		const url = `${API_BASE_URL}/servers/single/${serverId}`;
		console.info(`Fetching server info`, serverId, url);

		fetch(url, { headers: DEFAULT_HEADERS })
			.then(handleResponse)
			.then((json) => {
				setServerInfo(serverId, json.Data);
				let playersFetch = false; //Todo
				let url = `${API_BASE_URL}/servers/single/${serverId}`;
				fetchPlayers(url, playersFetch);
				startFetcher(serverId);
				showNotification('Server data loaded successfully', 'success');
			})
			.catch((error) => {
				console.error(error);
				setTitle('Error loading server data');
				showNotification('Failed to load server data', 'error');
				showLoader(false);
			});
	} catch (error) {
		console.error('Error in fetchServer:', error);
		showNotification('An unexpected error occurred', 'error');
		showLoader(false);
	}
};

const startFetcher = (serverId) => {
	console.log(`Starting fetcher at ${seconds} seconds`);
	if (fetcher) clearInterval(fetcher);
	fetcher = setInterval(() => {
		refreshTimer.textContent = seconds + 's';
		if (seconds < 1) {
			clearInterval(fetcher);
			fetchServer(serverId);
		}
		seconds--;
	}, 1000);
};

const fetchPlayers = (url, playersFetch = false) => {
	console.info('Fetching players with method:', playersFetch ? 'players.json' : 'normal', url);
	fetch(url, { headers: DEFAULT_HEADERS })
		.then(handleResponse)
		.then((json) => {
			let players = playersFetch ? json : json.Data.players;
			players = formatPlayers(players);

			// Only update if players changed
			if (!arraysEqual(currentPlayers, players)) {
				currentPlayers = players;
				renderPlayers(players);
				updateActivePlayers(players);
				checkPendingSearch();
			}

			showLoader(false);
		})
		.catch((error) => {
			console.error(error);
			showNotification('Failed to load player data', 'error');
			showLoader(false);
		});
};

const handleResponse = (response) => {
	if (!response.ok) {
		throw new Error(`HTTP error! Status: ${response.status}`);
	}
	return response.json();
};

const formatPlayers = (players) => {
	const formattedPlayers = [];
	const activeKeys = new Set();
	const now = Date.now();
	const isFirstSnapshot = !hasCapturedInitialSnapshot;
	players.forEach((player) => {
		const socials = {};

		if (player.identifiers) {
			const fiveMIdentifier = getFiveMId(player.identifiers);
			if (fiveMIdentifier) socials.fivem = fiveMIdentifier;

			const steamIdentifier = getSteamId(player.identifiers);
			if (steamIdentifier) socials.steam = steamIdentifier;

			const discordIdentifier = getDiscordId(player.identifiers);
			if (discordIdentifier) socials.discord = discordIdentifier;
		}

		const formattedPlayer = {
			name: player.name,
			id: player.id,
			socials,
			ping: player.ping,
		};

		const playerKey = getPlayerKey(formattedPlayer);
		activeKeys.add(playerKey);

		if (!playerJoinTimes.has(playerKey)) {
			const joinedAt = getJoinTimestampFromPlayer(player);
			if (joinedAt) {
				playerJoinTimes.set(playerKey, joinedAt);
			} else if (isFirstSnapshot) {
				playerJoinTimes.set(playerKey, null);
			} else {
				playerJoinTimes.set(playerKey, now);
			}
		}

		formattedPlayer.joinTimestamp = playerJoinTimes.get(playerKey);
		formattedPlayers.push(formattedPlayer);
	});

	for (const key of [...playerJoinTimes.keys()]) {
		if (!activeKeys.has(key)) {
			playerJoinTimes.delete(key);
		}
	}

	hasCapturedInitialSnapshot = true;

	return formattedPlayers.sort((a, b) => a.id - b.id);
};

const resetTable = () => {
	[...table.querySelectorAll('tr')].filter((tr) => tr.id !== 'table-header').forEach((tr) => tr.remove());
};

const STEAM_LINK = 'https://steamcommunity.com/profiles/%id%';
const DISCORD_LINK = 'https://discord.com/users/%id%';

const getJoinTimestampFromPlayer = (player) => {
	if (!player || typeof player !== 'object') return;

	const candidateKeys = ['joinedAt', 'joined_at', 'joinTime', 'join_time', 'connectedAt', 'connected_at', 'joined'];
	for (const key of candidateKeys) {
		const raw = player[key];
		const parsed = parseJoinTimestamp(raw);
		if (parsed) return parsed;
	}
};

const parseJoinTimestamp = (raw) => {
	if (!raw) return;

	if (typeof raw === 'number' && Number.isFinite(raw)) {
		if (raw > 9999999999) return raw;
		if (raw > 1000000000) return raw * 1000;
		return;
	}

	if (typeof raw === 'string') {
		const numeric = Number(raw);
		if (Number.isFinite(numeric) && numeric > 0) {
			if (numeric > 9999999999) return numeric;
			if (numeric > 1000000000) return numeric * 1000;
		}

		const dateMs = Date.parse(raw);
		if (!Number.isNaN(dateMs)) return dateMs;
	}
};

const updateRenderedJoinTimes = () => {
	const rows = table.querySelectorAll('tr[data-player-key]');
	rows.forEach((row) => {
		const key = row.getAttribute('data-player-key');
		if (!key) return;

		const startedAt = playerJoinTimes.get(key);
		if (!startedAt) return;

		const joinCell = row.querySelector('.table-join-time');
		if (!joinCell) return;

		if (!startedAt) {
			joinCell.textContent = '-';
			return;
		}

		joinCell.textContent = formatJoinDuration(Date.now() - startedAt);
	});
};

const startJoinTimer = () => {
	if (joinTimer) {
		clearInterval(joinTimer);
	}

	joinTimer = setInterval(() => {
		updateRenderedJoinTimes();
	}, 1000);
};

export const renderPlayers = (players, search = false) => {
	resetTable();

	console.info('Rendering new players', players.length);
	let index = 1;
	players.forEach((player) => {
		const tr = document.createElement('tr');
		// Ajoute la clé stable comme attribut pour la gestion des favoris
		const playerKey = getPlayerKey(player);
		tr.setAttribute('data-player-key', playerKey);

		const no = document.createElement('td');
		const star = document.createElement('td');
		const avatar = document.createElement('td');
		const id = document.createElement('td');
		const name = document.createElement('td');
		const socials = document.createElement('td');
		const joinTime = document.createElement('td');
		const ping = document.createElement('td');

		no.className = 'table-no';
		star.className = 'table-favorite';
		avatar.className = 'table-avatar';
		id.className = 'table-id';
		name.className = 'table-name';
		socials.className = 'table-socials';
		joinTime.className = 'table-join-time';
		ping.className = 'table-ping';

		no.textContent = index++ + '.';
		const isFavorite = isPlayerFavorite(playerKey);

		const starImg = document.createElement('img');
		starImg.src = isFavorite ? 'img/star.svg' : 'img/empty-star.svg';
		starImg.alt = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
		starImg.title = isFavorite ? 'Remove from Favorites' : 'Add to Favorites';
		star.appendChild(starImg);

		const avatarImg = document.createElement('img');
		avatarImg.src = getPlayerAvatarUrl(player);
		avatarImg.alt = `${player.name} avatar`;
		avatarImg.loading = 'lazy';
		avatarImg.referrerPolicy = 'no-referrer';
		avatarImg.onerror = () => {
			avatarImg.onerror = null;
			avatarImg.src = `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(player.name)}`;
		};
		avatar.appendChild(avatarImg);

		id.textContent = player.id;
		name.textContent = player.name;
		joinTime.textContent = player.joinTimestamp ? formatJoinDuration(Date.now() - player.joinTimestamp) : '-';
		ping.textContent = `${player.ping}ms`;

		if (player.socials.steam) {
			const link = document.createElement('a');
			link.href = STEAM_LINK.replace('%id%', player.socials.steam);
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			const steamImg = document.createElement('img');
			steamImg.src = 'img/steam.svg';
			steamImg.alt = 'Steam';
			link.appendChild(steamImg);
			socials.appendChild(link);
		}
		if (player.socials.discord) {
			const link = document.createElement('a');
			link.href = DISCORD_LINK.replace('%id%', player.socials.discord);
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			const discordImg = document.createElement('img');
			discordImg.src = 'img/discord.svg';
			discordImg.alt = 'Discord';
			link.appendChild(discordImg);
			socials.appendChild(link);
		}

		if (!player.socials.steam && !player.socials.discord) {
			socials.textContent = '-';
		}

		tr.appendChild(no);
		tr.appendChild(star);
		tr.appendChild(avatar);
		tr.appendChild(id);
		tr.appendChild(name);
		tr.appendChild(socials);
		tr.appendChild(joinTime);
		tr.appendChild(ping);

		table.appendChild(tr);
	});
	const footerTr = document.createElement('tr');
	footerTr.className = 'table-footer';

	const footerTd = document.createElement('td');
	footerTd.rowSpan = 5;

	const span1 = document.createElement('span');
	span1.textContent = 'This page is not affiliated with FiveM or any other server.';
	footerTd.appendChild(span1);
	footerTd.appendChild(document.createElement('br'));

	const span2 = document.createElement('span');
	span2.appendChild(document.createTextNode('Created by '));

	const link = document.createElement('a');
	link.href = 'https://github.com/HASANMDNAHID';
	link.target = '_blank';
	link.rel = 'noopener noreferrer';
	link.textContent = 'HASANMDNAHID';

	span2.appendChild(link);
	span2.appendChild(document.createTextNode('.'));

	footerTd.appendChild(span2);
	footerTr.appendChild(footerTd);
	table.appendChild(footerTr);

	updateRenderedJoinTimes();
	startJoinTimer();

	if (isSearching() && !search) searchPlayers();
};

const isValidServerId = (serverId) => {
	return typeof serverId === 'string' && /^[a-zA-Z0-9]+$/.test(serverId);
};

const formatJoinDuration = (elapsedMs) => {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	const pad = (value) => String(value).padStart(2, '0');
	if (hours > 0) {
		return `${hours}:${pad(minutes)}:${pad(seconds)}`;
	}

	return `${minutes}:${pad(seconds)}`;
};

const arraysEqual = (a, b) => {
	if (!a || !b) return false;
	if (a.length !== b.length) return false;

	// Simple comparison of player IDs and names
	const aIds = a.map((p) => `${p.id}-${p.name}-${p.ping}`).sort();
	const bIds = b.map((p) => `${p.id}-${p.name}-${p.ping}`).sort();

	return JSON.stringify(aIds) === JSON.stringify(bIds);
};

const showLoader = (isVisible) => {
	if (loader) {
		loader.style.display = isVisible ? 'flex' : 'none';
	}
};

// Notification system
const showNotification = (message, type) => {
	if (window.createNotification) {
		window.createNotification({
			message,
			type,
			duration: 3000,
		});
	}
};

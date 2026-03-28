const normalizeIdentifiers = (ids) => {
	if (!ids) return [];

	if (Array.isArray(ids)) {
		return ids.filter((value) => typeof value === 'string');
	}

	if (typeof ids === 'string') {
		return [ids];
	}

	if (typeof ids === 'object') {
		const normalized = [];
		for (const [key, value] of Object.entries(ids)) {
			if (typeof value !== 'string') continue;
			if (value.includes(':')) {
				normalized.push(value);
				continue;
			}
			normalized.push(`${key}:${value}`);
		}
		return normalized;
	}

	return [];
};

const getIdentifierValue = (ids, prefix) => {
	const normalizedIds = normalizeIdentifiers(ids);
	const normalizedPrefix = `${prefix.toLowerCase()}:`;
	const identifier = normalizedIds.find((value) => value.toLowerCase().startsWith(normalizedPrefix));
	if (!identifier) return;

	return identifier.substring(identifier.indexOf(':') + 1).trim();
};

export const getSteamId = (ids) => {
	const rawSteamId = getIdentifierValue(ids, 'steam');
	if (!rawSteamId) return;
	const normalized = rawSteamId.replace(/^0x/i, '').trim();

	// Common case: already SteamID64 decimal.
	if (/^7656119[0-9]+$/.test(normalized)) {
		return normalized;
	}

	// FiveM often exposes steam hex without letters (e.g. 1100001...).
	if (/^1100001[0-9a-fA-F]*$/i.test(normalized)) {
		return hexToDecimal(normalized);
	}

	// Generic hex fallback.
	if (/^[0-9a-fA-F]+$/.test(normalized)) {
		return hexToDecimal(normalized);
	}

	// Fallback: keep numeric input unchanged.
	if (/^[0-9]+$/.test(normalized)) {
		return normalized;
	}
};

export const getDiscordId = (ids) => {
	const rawDiscordId = getIdentifierValue(ids, 'discord');
	if (!rawDiscordId) return;

	return rawDiscordId;
};

export const getFiveMId = (ids) => {
	const rawFiveMId = getIdentifierValue(ids, 'fivem') || getIdentifierValue(ids, 'cfx');
	if (!rawFiveMId) return;

	return rawFiveMId;
};

export const hexToDecimal = (s) => {
	var i,
		j,
		digits = [0],
		carry;
	for (i = 0; i < s.length; i += 1) {
		carry = parseInt(s.charAt(i), 16);
		for (j = 0; j < digits.length; j += 1) {
			digits[j] = digits[j] * 16 + carry;
			carry = (digits[j] / 10) | 0;
			digits[j] %= 10;
		}
		while (carry > 0) {
			digits.push(carry % 10);
			carry = (carry / 10) | 0;
		}
	}
	return digits.reverse().join('');
};

const encodeSeed = (value) => encodeURIComponent(value || 'Unknown');
const normalizeFivemId = (value) => String(value || '').trim().replace(/^fivem:/i, '').replace(/^cfx:/i, '');

export const getPlayerAvatarCandidates = ({ name, socials = {} } = {}) => {
	const candidates = [];
	const pushCandidate = (value) => {
		if (typeof value !== 'string' || value.length < 1) return;
		if (!candidates.includes(value)) candidates.push(value);
	};

	if (typeof socials.avatarUrl === 'string' && socials.avatarUrl.length > 0) {
		pushCandidate(socials.avatarUrl);
	}

	if (socials.fivem) {
		const fivemId = normalizeFivemId(socials.fivem);
		if (fivemId.length > 0) {
			// Multiple FiveM/Cfx avatar hosts are tried because availability differs by account.
			pushCandidate(`https://avatar.cfx.re/${encodeURIComponent(fivemId)}`);
			pushCandidate(`https://avatars.fivem.net/${encodeURIComponent(fivemId)}`);
			pushCandidate(`https://unavatar.io/fivem/${encodeURIComponent(fivemId)}`);
		}
	}

	if (socials.steam) {
		pushCandidate(`https://unavatar.io/steam/${socials.steam}`);
	}

	if (socials.discord) {
		pushCandidate(`https://unavatar.io/discord/${socials.discord}`);
	}

	pushCandidate(`https://api.dicebear.com/9.x/initials/svg?seed=${encodeSeed(name)}`);
	return candidates;
};

export const getPlayerAvatarUrl = ({ name, socials = {} } = {}) => {
	return getPlayerAvatarCandidates({ name, socials })[0];
};

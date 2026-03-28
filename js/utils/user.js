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

	// Some APIs expose steam in hex (110000...) and others in decimal (7656119...).
	if (/^[0-9]+$/.test(rawSteamId)) {
		return rawSteamId;
	}

	const hexSteamId = rawSteamId.replace(/^0x/i, '');
	if (/^[0-9a-fA-F]+$/.test(hexSteamId)) {
		return hexToDecimal(hexSteamId);
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

export const getPlayerAvatarUrl = ({ name, socials = {} } = {}) => {
	if (socials.fivem) {
		return `https://unavatar.io/fivem/${socials.fivem}`;
	}

	if (socials.steam) {
		return `https://unavatar.io/steam/${socials.steam}`;
	}

	if (socials.discord) {
		return `https://unavatar.io/discord/${socials.discord}`;
	}

	return `https://api.dicebear.com/9.x/initials/svg?seed=${encodeSeed(name)}`;
};

const WPA_PASSPHRASE_MIN_BYTES = 8
const WPA_PASSPHRASE_MAX_BYTES = 63
const WPA_HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i

export const isValidWifiPassword = (password: string): boolean => {
    if (WPA_HEX_KEY_PATTERN.test(password)) return true

    const byteLength = new TextEncoder().encode(password).length
    return byteLength >= WPA_PASSPHRASE_MIN_BYTES && byteLength <= WPA_PASSPHRASE_MAX_BYTES
}

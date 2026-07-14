import { describe, expect, it } from 'vitest'
import { isValidWifiPassword } from '@/plugins/wifi'

describe('Wifi password validation', () => {
    it('accepts WPA passphrases that are 8 to 63 UTF-8 bytes', () => {
        expect(isValidWifiPassword('12345678')).toBe(true)
        expect(isValidWifiPassword('1234567')).toBe(false)
        expect(isValidWifiPassword('x'.repeat(63))).toBe(true)
        expect(isValidWifiPassword('x'.repeat(64))).toBe(false)
    })

    it('measures multi-byte passphrases by UTF-8 byte length', () => {
        expect(isValidWifiPassword('密'.repeat(21))).toBe(true)
        expect(isValidWifiPassword('密'.repeat(22))).toBe(false)
    })

    it('accepts a 64-character hexadecimal PSK without trimming it', () => {
        expect(isValidWifiPassword('a'.repeat(64))).toBe(true)
        expect(isValidWifiPassword(' 123456 ')).toBe(true)
    })
})

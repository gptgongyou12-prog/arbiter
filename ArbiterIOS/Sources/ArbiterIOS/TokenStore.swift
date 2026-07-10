import Foundation
import Security

/// Persists the access/refresh tokens in the Keychain (survives app restarts, encrypted at
/// rest by the OS) so a long-term login session works the same way as the Android app's
/// EncryptedSharedPreferences-backed TokenStore.
final class TokenStore {
    private let service = "site.funclass.arbiter.ios.auth"

    var accessToken: String? {
        get { read(key: "access_token") }
        set { write(key: "access_token", value: newValue) }
    }

    var refreshToken: String? {
        get { read(key: "refresh_token") }
        set { write(key: "refresh_token", value: newValue) }
    }

    var isLoggedIn: Bool { refreshToken != nil }

    func clear() {
        accessToken = nil
        refreshToken = nil
    }

    private func read(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func write(key: String, value: String?) {
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(baseQuery as CFDictionary)
        guard let value, let data = value.data(using: .utf8) else { return }
        var addQuery = baseQuery
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(addQuery as CFDictionary, nil)
    }
}

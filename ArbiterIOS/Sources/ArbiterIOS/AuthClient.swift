import Foundation

let apiBaseURL = URL(string: "https://funclass.site")!

/// Login/refresh talk to the backend directly (not through APIClient) because the tokens only
/// ever arrive as Set-Cookie headers, never in the JSON body. URLSession's shared cookie
/// storage parses Set-Cookie automatically, so we just read the parsed cookies back out
/// afterwards instead of hand-parsing the header (unlike the Android OkHttp version, which
/// has no built-in cookie jar wired up the same way).
final class AuthClient {
    private let tokenStore: TokenStore
    private let session = URLSession(configuration: .default)

    init(tokenStore: TokenStore) {
        self.tokenStore = tokenStore
    }

    func login(username: String, password: String) async -> Bool {
        var request = URLRequest(url: apiBaseURL.appendingPathComponent("/api/auth/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "username": username, "password": password,
        ])

        guard let (_, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return false
        }
        return captureTokens()
    }

    func refresh() async -> Bool {
        guard let refreshToken = tokenStore.refreshToken else { return false }
        var request = URLRequest(url: apiBaseURL.appendingPathComponent("/api/auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("refresh_token=\(refreshToken)", forHTTPHeaderField: "Cookie")
        request.httpBody = Data()

        guard let (_, response) = try? await session.data(for: request),
              let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            return false
        }
        return captureTokens()
    }

    func logout() {
        tokenStore.clear()
    }

    private func captureTokens() -> Bool {
        let cookies = HTTPCookieStorage.shared.cookies(for: apiBaseURL) ?? []
        var found = false
        for cookie in cookies {
            if cookie.name == "access_token" {
                tokenStore.accessToken = cookie.value
                found = true
            } else if cookie.name == "refresh_token" {
                tokenStore.refreshToken = cookie.value
            }
        }
        return found
    }
}

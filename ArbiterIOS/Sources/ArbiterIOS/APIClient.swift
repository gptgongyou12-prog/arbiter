import Foundation

/// Thin URLSession-based API client mirroring the Android app's OkHttp+AuthInterceptor: attach
/// the Bearer token to every request, and on a 401 refresh once and retry.
final class APIClient {
    let tokenStore: TokenStore
    let authClient: AuthClient
    private let session = URLSession(configuration: .default)
    private let decoder = JSONDecoder()

    init(tokenStore: TokenStore, authClient: AuthClient) {
        self.tokenStore = tokenStore
        self.authClient = authClient
    }

    func streamURL(trackPublicId: String) -> URL {
        apiBaseURL.appendingPathComponent("/api/stream/\(trackPublicId)")
    }

    func authHeader() -> String? {
        tokenStore.accessToken.map { "Bearer \($0)" }
    }

    // MARK: - Endpoints

    func listFolders(parentId: Int64?) async -> [Folder] {
        var comps = URLComponents(url: apiBaseURL.appendingPathComponent("/api/folders"), resolvingAgainstBaseURL: false)!
        if let parentId {
            comps.queryItems = [URLQueryItem(name: "parent_id", value: String(parentId))]
        }
        return await get(comps.url!) ?? []
    }

    func listProjects(folderId: String) async -> [Project] {
        var comps = URLComponents(url: apiBaseURL.appendingPathComponent("/api/projects"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "folder_id", value: folderId)]
        return await get(comps.url!) ?? []
    }

    func listTracks(projectId: String) async -> [Track] {
        var comps = URLComponents(url: apiBaseURL.appendingPathComponent("/api/tracks"), resolvingAgainstBaseURL: false)!
        comps.queryItems = [URLQueryItem(name: "project_id", value: projectId)]
        return await get(comps.url!) ?? []
    }

    func getLyrics(trackPublicId: String) async -> LyricsResponse? {
        await get(apiBaseURL.appendingPathComponent("/api/tracks/\(trackPublicId)/lyrics"))
    }

    func fetchLyrics(trackPublicId: String) async -> LyricsResponse? {
        await post(apiBaseURL.appendingPathComponent("/api/tracks/\(trackPublicId)/lyrics/fetch"), body: [:])
    }

    // MARK: - Core request plumbing

    private func get<T: Decodable>(_ url: URL) async -> T? {
        await request(url, method: "GET", body: nil)
    }

    private func post<T: Decodable>(_ url: URL, body: [String: String]) async -> T? {
        let data = try? JSONSerialization.data(withJSONObject: body)
        return await request(url, method: "POST", body: data)
    }

    private func request<T: Decodable>(_ url: URL, method: String, body: Data?, isRetry: Bool = false) async -> T? {
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.httpBody = body
        if body != nil {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if let auth = authHeader() {
            req.setValue(auth, forHTTPHeaderField: "Authorization")
        }

        guard let (data, response) = try? await session.data(for: req),
              let http = response as? HTTPURLResponse else {
            return nil
        }

        if http.statusCode == 401 && !isRetry && tokenStore.refreshToken != nil {
            if await authClient.refresh() {
                return await request(url, method: method, body: body, isRetry: true)
            }
            return nil
        }

        guard http.statusCode == 200 else { return nil }
        return try? decoder.decode(T.self, from: data)
    }
}

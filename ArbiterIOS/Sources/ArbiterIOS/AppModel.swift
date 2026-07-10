import Foundation

@MainActor
final class AppModel: ObservableObject {
    let tokenStore: TokenStore
    let authClient: AuthClient
    let apiClient: APIClient
    let playback = PlaybackManager()

    @Published var isLoggedIn: Bool

    init() {
        let tokenStore = TokenStore()
        let authClient = AuthClient(tokenStore: tokenStore)
        self.tokenStore = tokenStore
        self.authClient = authClient
        self.apiClient = APIClient(tokenStore: tokenStore, authClient: authClient)
        self.isLoggedIn = tokenStore.isLoggedIn
        playback.configure(apiClient: apiClient)
    }

    func onLoginSuccess() {
        isLoggedIn = true
    }
}

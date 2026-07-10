import SwiftUI

@main
struct ArbiterApp: App {
    @StateObject private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(app)
        }
    }
}

private struct RootView: View {
    @EnvironmentObject var app: AppModel
    @State private var path: [Route] = []

    var body: some View {
        if !app.isLoggedIn {
            LoginView()
        } else {
            NavigationStack(path: $path) {
                VStack(spacing: 0) {
                    FolderView(folderId: "root")
                        .navigationDestination(for: Route.self) { route in
                            switch route {
                            case .folder(let id):
                                FolderView(folderId: id)
                            case .tracks(let id, let name):
                                TrackListView(projectId: id, projectName: name)
                            }
                        }
                    PlayerBar(playback: app.playback)
                }
                .background(Theme.bg0)
            }
        }
    }
}

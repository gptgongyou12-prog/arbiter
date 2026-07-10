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
    @State private var showLyrics = false
    @State private var showQueue = false

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
                    PlayerBar(
                        playback: app.playback,
                        onLyricsClick: { showLyrics = true },
                        onQueueClick: { showQueue = true }
                    )
                }
                .background(Theme.bg0)
            }
            .sheet(isPresented: $showLyrics) {
                if let trackId = app.playback.currentTrackId {
                    LyricsView(
                        apiClient: app.apiClient,
                        trackPublicId: trackId,
                        positionSeconds: app.playback.positionSeconds,
                        onDismiss: { showLyrics = false }
                    )
                }
            }
            .sheet(isPresented: $showQueue) {
                QueueView(
                    queue: app.playback.queue,
                    currentIndex: app.playback.currentQueueIndex,
                    onSelect: { app.playback.jumpToQueueIndex($0) },
                    onDismiss: { showQueue = false }
                )
            }
        }
    }
}

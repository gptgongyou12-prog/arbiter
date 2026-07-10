import SwiftUI

struct TrackListView: View {
    @EnvironmentObject var app: AppModel
    let projectId: String
    let projectName: String

    @State private var tracks: [Track] = []
    @State private var loading = true

    var body: some View {
        ZStack {
            Theme.bg0.ignoresSafeArea()
            if loading {
                ProgressView().tint(Theme.accentBlue)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                            Button {
                                app.playback.playQueue(tracks: tracks, startIndex: index)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(track.title).foregroundColor(Theme.text0)
                                    if let artist = track.artist {
                                        Text(artist).foregroundColor(Theme.text1).font(.footnote)
                                    }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 21))
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .navigationTitle(projectName)
        .task(id: projectId) {
            loading = true
            tracks = await app.apiClient.listTracks(projectId: projectId)
            loading = false
        }
    }
}

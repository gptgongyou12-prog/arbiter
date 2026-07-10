import SwiftUI

struct PlayerBar: View {
    @EnvironmentObject var app: AppModel
    @ObservedObject var playback: PlaybackManager
    var onLyricsClick: () -> Void = {}
    var onQueueClick: () -> Void = {}

    var body: some View {
        if playback.hasMedia {
            VStack(spacing: 8) {
                ProgressView(value: playback.durationSeconds > 0 ? playback.positionSeconds / playback.durationSeconds : 0)
                    .tint(Theme.accentBlue)

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(playback.currentTitle).foregroundColor(Theme.text0).lineLimit(1)
                        Text(playback.currentArtist).foregroundColor(Theme.text1).font(.footnote).lineLimit(1)
                    }
                    Spacer()
                    Button { playback.previous() } label: {
                        Image(systemName: "backward.fill").foregroundColor(Theme.text0)
                    }
                    Button { playback.togglePlayPause() } label: {
                        Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
                            .foregroundColor(.white)
                            .frame(width: 44, height: 44)
                            .background(Theme.accentBlue, in: Circle())
                    }
                    Button { playback.next() } label: {
                        Image(systemName: "forward.fill").foregroundColor(Theme.text0)
                    }
                }

                HStack(spacing: 28) {
                    Button { playback.toggleShuffle() } label: {
                        Image(systemName: "shuffle")
                            .foregroundColor(playback.shuffleEnabled ? Theme.accentBlue : Theme.text1)
                    }
                    Button { onLyricsClick() } label: {
                        Image(systemName: "quote.bubble").foregroundColor(Theme.text1)
                    }
                    Spacer()
                    Button { playback.cycleRepeatMode() } label: {
                        Image(systemName: repeatIcon)
                            .foregroundColor(playback.repeatMode == .off ? Theme.text1 : Theme.accentBlue)
                    }
                    Button { onQueueClick() } label: {
                        Image(systemName: "list.bullet").foregroundColor(Theme.text1)
                    }
                }
            }
            .padding(12)
            .arbiterGlass(cornerRadius: 24)
            .padding(.horizontal, 8)
        }
    }

    private var repeatIcon: String {
        switch playback.repeatMode {
        case .off, .all: return "repeat"
        case .one: return "repeat.1"
        }
    }
}

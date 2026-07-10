import SwiftUI

struct QueueView: View {
    let queue: [Track]
    let currentIndex: Int
    let onSelect: (Int) -> Void
    let onDismiss: () -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(Array(queue.enumerated()), id: \.element.id) { index, track in
                    Button {
                        onSelect(index)
                        onDismiss()
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(track.title)
                                .foregroundColor(index == currentIndex ? Theme.accentBlue : Theme.text0)
                                .lineLimit(1)
                            if let artist = track.artist {
                                Text(artist).foregroundColor(Theme.text1).font(.footnote).lineLimit(1)
                            }
                        }
                    }
                    .listRowBackground(index == currentIndex ? Theme.bg1 : Theme.bg2)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Theme.bg2)
            .navigationTitle("재생목록 (\(queue.count)곡)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기", action: onDismiss)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

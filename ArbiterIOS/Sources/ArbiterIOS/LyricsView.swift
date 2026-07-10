import SwiftUI

private struct LrcLine: Identifiable {
    let index: Int
    let timeMs: Int
    let text: String
    var id: Int { index }
}

private enum LyricsState {
    case loading
    case notFound
    case plain([String])
    case synced([LrcLine])
}

private let lrcTimeRegex = try! NSRegularExpression(pattern: #"\[(\d{2}):(\d{2})\.(\d{2,3})](.*)"#)

private func parseLrc(_ raw: String) -> [LrcLine] {
    var lines: [(Int, String)] = []
    for line in raw.split(separator: "\n", omittingEmptySubsequences: false) {
        let s = String(line)
        let range = NSRange(s.startIndex..., in: s)
        guard let m = lrcTimeRegex.firstMatch(in: s, range: range) else { continue }
        func group(_ i: Int) -> String { (s as NSString).substring(with: m.range(at: i)) }
        let min = Int(group(1)) ?? 0
        let sec = Int(group(2)) ?? 0
        let fracRaw = group(3)
        let frac = fracRaw.count == 2 ? (Int(fracRaw) ?? 0) * 10 : (Int(fracRaw) ?? 0)
        let text = group(4).trimmingCharacters(in: .whitespaces)
        lines.append((min * 60_000 + sec * 1000 + frac, text))
    }
    return lines.sorted { $0.0 < $1.0 }.enumerated().map { LrcLine(index: $0.offset, timeMs: $0.element.0, text: $0.element.1) }
}

/// Index of the last line whose timestamp has already passed.
private func currentLineIndex(_ lines: [LrcLine], positionMs: Int) -> Int {
    var idx = -1
    for line in lines {
        if line.timeMs <= positionMs { idx = line.index } else { break }
    }
    return idx
}

struct LyricsView: View {
    let apiClient: APIClient
    let trackPublicId: String
    let positionSeconds: Double
    let onDismiss: () -> Void

    @State private var state: LyricsState = .loading

    var body: some View {
        NavigationStack {
            Group {
                switch state {
                case .loading:
                    ProgressView().tint(Theme.accentBlue)
                case .notFound:
                    Text("가사를 찾을 수 없습니다").foregroundColor(Theme.text1)
                case .plain(let lines):
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                                Text(line.isEmpty ? " " : line).foregroundColor(Theme.text0)
                            }
                        }
                        .padding(24)
                    }
                case .synced(let lines):
                    SyncedLyricsScrollView(lines: lines, positionMs: Int(positionSeconds * 1000))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.bg2)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("닫기", action: onDismiss)
                }
            }
        }
        .task(id: trackPublicId) {
            state = .loading
            let existing = await apiClient.getLyrics(trackPublicId: trackPublicId)
            let body = (existing.flatMap { $0.lyrics.isEmpty && $0.syncedLyrics.isEmpty ? nil : $0 })
                ?? (await apiClient.fetchLyrics(trackPublicId: trackPublicId))
            guard let body else {
                state = .notFound
                return
            }
            if !body.syncedLyrics.isEmpty {
                let parsed = parseLrc(body.syncedLyrics)
                state = parsed.isEmpty ? plainOrNotFound(body.lyrics) : .synced(parsed)
            } else {
                state = plainOrNotFound(body.lyrics)
            }
        }
    }

    private func plainOrNotFound(_ lyrics: String) -> LyricsState {
        lyrics.isEmpty ? .notFound : .plain(lyrics.split(separator: "\n", omittingEmptySubsequences: false).map(String.init))
    }
}

private struct SyncedLyricsScrollView: View {
    let lines: [LrcLine]
    let positionMs: Int

    var body: some View {
        let currentIndex = currentLineIndex(lines, positionMs: positionMs)
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(lines) { line in
                        Text(line.text.isEmpty ? " " : line.text)
                            .font(line.index == currentIndex ? .body.bold() : .body)
                            .foregroundColor(line.index == currentIndex ? Theme.accentBlue : Theme.text1)
                            .id(line.index)
                    }
                }
                .padding(24)
            }
            .onChange(of: currentIndex) { _, newValue in
                guard newValue >= 0 else { return }
                withAnimation {
                    proxy.scrollTo(max(newValue - 2, 0), anchor: .top)
                }
            }
        }
    }
}

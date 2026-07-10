import AVFoundation
import Combine
import MediaPlayer

enum PlayerRepeatMode { case off, all, one }

/// Real background audio via AVAudioSession(.playback) + MPRemoteCommandCenter — the iOS
/// equivalent of the Android app's Media3 foreground-service PlaybackService. This is what
/// actually keeps audio alive when the app is backgrounded/screen-locked, unlike the PWA
/// which only gets as much background execution as Safari is willing to grant a web page.
///
/// Uses a single AVPlayer with a manually-managed play order (rather than AVQueuePlayer) so
/// shuffle, repeat, and jump-to-index all work the same way the Android PlaybackService's
/// ExoPlayer-backed queue does — AVQueuePlayer has no way to reorder or jump non-destructively.
@MainActor
final class PlaybackManager: NSObject, ObservableObject {
    @Published var isPlaying = false
    @Published var currentTitle = ""
    @Published var currentArtist = ""
    @Published var currentTrackId: String?
    @Published var positionSeconds: Double = 0
    @Published var durationSeconds: Double = 0
    @Published var hasMedia = false
    @Published var shuffleEnabled = false
    @Published var repeatMode: PlayerRepeatMode = .off
    @Published var queue: [Track] = []
    @Published var currentQueueIndex: Int = -1

    private let player = AVPlayer()
    private var originalTracks: [Track] = []
    private var playOrder: [Int] = []
    private var apiClient: APIClient?
    private var timeObserver: Any?
    private var tokenRefreshTimer: Timer?
    private var endObserver: NSObjectProtocol?

    func configure(apiClient: APIClient) {
        self.apiClient = apiClient
        setupAudioSession()
        setupRemoteCommands()
        startPositionObserver()
        startTokenRefreshLoop()
    }

    private func setupAudioSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
    }

    private func setupRemoteCommands() {
        let commandCenter = MPRemoteCommandCenter.shared()
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.play(); return .success
        }
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause(); return .success
        }
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            self?.next(); return .success
        }
        commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            self?.previous(); return .success
        }
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let self, let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self.seek(to: e.positionTime)
            return .success
        }
    }

    private func startPositionObserver() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: 600)
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self else { return }
            self.positionSeconds = time.seconds
            if let duration = self.player.currentItem?.duration.seconds, duration.isFinite {
                self.durationSeconds = duration
            }
            self.updateNowPlayingInfo()
        }
    }

    /// The access token is a 15-minute JWT baked into each AVPlayerItem's headers at creation
    /// time (AVURLAsset headers can't be swapped after the fact) — refreshing periodically
    /// keeps it from going stale mid-session the same way the Android PlaybackService does.
    private func startTokenRefreshLoop() {
        tokenRefreshTimer = Timer.scheduledTimer(withTimeInterval: 600, repeats: true) { [weak self] _ in
            guard let self, let apiClient = self.apiClient, apiClient.tokenStore.isLoggedIn else { return }
            Task { _ = await apiClient.authClient.refresh() }
        }
    }

    // MARK: - Playback control

    func playQueue(tracks: [Track], startIndex: Int) {
        originalTracks = tracks
        playOrder = Array(tracks.indices)
        shuffleEnabled = false
        repeatMode = .off
        publishQueue()
        loadAndPlay(at: startIndex)
    }

    private func loadAndPlay(at position: Int) {
        guard let apiClient, playOrder.indices.contains(position) else { return }
        currentQueueIndex = position
        let track = originalTracks[playOrder[position]]
        let item = makePlayerItem(for: track, apiClient: apiClient)
        observeItemEnd(item)
        player.replaceCurrentItem(with: item)
        applyMetadata(for: track)
        play()
    }

    private func publishQueue() {
        queue = playOrder.map { originalTracks[$0] }
    }

    func play() {
        player.play()
        isPlaying = true
        updateNowPlayingInfo()
    }

    func pause() {
        player.pause()
        isPlaying = false
        updateNowPlayingInfo()
    }

    func togglePlayPause() {
        isPlaying ? pause() : play()
    }

    func next() {
        advance(auto: false)
    }

    /// `auto` distinguishes a natural end-of-track advance (where repeat-one should replay
    /// the same track) from an explicit user tap on "next" (which always moves forward).
    private func advance(auto: Bool) {
        guard !playOrder.isEmpty else { return }
        if auto && repeatMode == .one {
            seek(to: 0)
            play()
            return
        }
        var pos = currentQueueIndex + 1
        if pos >= playOrder.count {
            guard repeatMode == .all else {
                pause()
                return
            }
            pos = 0
        }
        loadAndPlay(at: pos)
    }

    func previous() {
        // Matches the common mobile-player convention: restart the current track if it's
        // more than a few seconds in, otherwise actually go to the previous track.
        if positionSeconds > 3 {
            seek(to: 0)
            return
        }
        guard !playOrder.isEmpty else { return }
        var pos = currentQueueIndex - 1
        if pos < 0 {
            guard repeatMode == .all else { return }
            pos = playOrder.count - 1
        }
        loadAndPlay(at: pos)
    }

    func jumpToQueueIndex(_ index: Int) {
        loadAndPlay(at: index)
    }

    func toggleShuffle() {
        let currentTrack = playOrder.indices.contains(currentQueueIndex) ? playOrder[currentQueueIndex] : nil
        shuffleEnabled.toggle()
        if shuffleEnabled {
            var order = Array(originalTracks.indices)
            order.shuffle()
            if let currentTrack, let idx = order.firstIndex(of: currentTrack) {
                order.swapAt(0, idx)
            }
            playOrder = order
        } else {
            playOrder = Array(originalTracks.indices)
        }
        if let currentTrack, let newPos = playOrder.firstIndex(of: currentTrack) {
            currentQueueIndex = newPos
        }
        publishQueue()
    }

    /// Cycles OFF -> ALL -> ONE -> OFF, matching the Android app's convention.
    func cycleRepeatMode() {
        repeatMode = switch repeatMode {
        case .off: .all
        case .all: .one
        case .one: .off
        }
    }

    func seek(to seconds: Double) {
        player.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
    }

    private func makePlayerItem(for track: Track, apiClient: APIClient) -> AVPlayerItem {
        var headers: [String: String] = [:]
        if let auth = apiClient.authHeader() {
            headers["Authorization"] = auth
        }
        let asset = AVURLAsset(
            url: apiClient.streamURL(trackPublicId: track.publicId),
            options: ["AVURLAssetHTTPHeaderFieldsKey": headers]
        )
        return AVPlayerItem(asset: asset)
    }

    private func observeItemEnd(_ item: AVPlayerItem) {
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
        ) { [weak self] _ in
            self?.advance(auto: true)
        }
    }

    private func applyMetadata(for track: Track) {
        currentTrackId = track.publicId
        currentTitle = track.title
        currentArtist = track.artist ?? ""
        hasMedia = true
        updateNowPlayingInfo()
    }

    private func updateNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: currentTitle,
            MPMediaItemPropertyArtist: currentArtist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: positionSeconds,
            MPMediaItemPropertyPlaybackDuration: durationSeconds,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
    }
}

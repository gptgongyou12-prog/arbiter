import AVFoundation
import Combine
import MediaPlayer

/// Real background audio via AVAudioSession(.playback) + MPRemoteCommandCenter — the iOS
/// equivalent of the Android app's Media3 foreground-service PlaybackService. This is what
/// actually keeps audio alive when the app is backgrounded/screen-locked, unlike the PWA
/// which only gets as much background execution as Safari is willing to grant a web page.
@MainActor
final class PlaybackManager: NSObject, ObservableObject {
    @Published var isPlaying = false
    @Published var currentTitle = ""
    @Published var currentArtist = ""
    @Published var currentTrackId: String?
    @Published var positionSeconds: Double = 0
    @Published var durationSeconds: Double = 0
    @Published var hasMedia = false

    private let player = AVQueuePlayer()
    private var queueTracks: [Track] = []
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
        guard let apiClient else { return }
        queueTracks = tracks
        let items = tracks[startIndex...].map { makePlayerItem(for: $0, apiClient: apiClient) }
        player.removeAllItems()
        for item in items {
            player.insert(item, after: nil)
        }
        observeCurrentItemEnd()
        applyCurrentMetadata()
        play()
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
        player.advanceToNextItem()
        applyCurrentMetadata()
    }

    func previous() {
        // AVQueuePlayer has no native "previous" — restart the current track, matching the
        // common mobile-player convention of "previous = restart unless near the very start".
        seek(to: 0)
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
        let item = AVPlayerItem(asset: asset)
        item.trackIdentifier = track.publicId
        return item
    }

    private func observeCurrentItemEnd() {
        if let endObserver {
            NotificationCenter.default.removeObserver(endObserver)
        }
        endObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main
        ) { [weak self] _ in
            self?.applyCurrentMetadata()
        }
    }

    private func applyCurrentMetadata() {
        guard let id = player.currentItem?.trackIdentifier,
              let track = queueTracks.first(where: { $0.publicId == id }) else {
            hasMedia = player.currentItem != nil
            return
        }
        currentTrackId = track.publicId
        currentTitle = track.title
        currentArtist = track.artist ?? ""
        hasMedia = true
        updateNowPlayingInfo()
    }

    private func updateNowPlayingInfo() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: currentTitle,
            MPMediaItemPropertyArtist: currentArtist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: positionSeconds,
            MPMediaItemPropertyPlaybackDuration: durationSeconds,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        ]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        _ = info // silence unused-mutation warning if artwork loading is added later
    }
}

/// AVPlayerItem doesn't carry custom metadata by default — stash the track's public_id via
/// associated storage so we can look up which Track is currently playing.
private var trackIdentifierKey: UInt8 = 0
extension AVPlayerItem {
    var trackIdentifier: String? {
        get { objc_getAssociatedObject(self, &trackIdentifierKey) as? String }
        set { objc_setAssociatedObject(self, &trackIdentifierKey, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }
}

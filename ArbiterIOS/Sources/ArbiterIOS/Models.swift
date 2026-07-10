import Foundation

struct Project: Codable, Identifiable {
    let publicId: String
    let name: String
    let coverUrl: String?

    var id: String { publicId }

    enum CodingKeys: String, CodingKey {
        case publicId = "public_id"
        case name
        case coverUrl = "cover_url"
    }
}

struct Folder: Codable, Identifiable {
    let id: Int64
    let name: String
    let parentId: Int64?

    enum CodingKeys: String, CodingKey {
        case id, name
        case parentId = "parent_id"
    }
}

struct Track: Codable, Identifiable {
    let publicId: String
    let title: String
    let artist: String?
    let album: String?
    let coverUrl: String?
    let durationSeconds: Double?
    let waveform: String?

    var id: String { publicId }

    enum CodingKeys: String, CodingKey {
        case publicId = "public_id"
        case title, artist, album, waveform
        case coverUrl = "cover_url"
        case durationSeconds = "active_version_duration_seconds"
    }
}

struct LyricsResponse: Codable {
    let lyrics: String
    let syncedLyrics: String

    enum CodingKeys: String, CodingKey {
        case lyrics
        case syncedLyrics = "synced_lyrics"
    }
}

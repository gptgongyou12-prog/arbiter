import SwiftUI

struct FolderView: View {
    @EnvironmentObject var app: AppModel
    let folderId: String

    @State private var folders: [Folder] = []
    @State private var projects: [Project] = []
    @State private var loading = true

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        ZStack {
            Theme.bg0.ignoresSafeArea()
            if loading {
                ProgressView().tint(Theme.accentBlue)
            } else {
                ScrollView {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(folders) { folder in
                            NavigationLink(value: Route.folder(String(folder.id))) {
                                FolderCard(name: folder.name)
                            }
                        }
                        ForEach(projects) { project in
                            NavigationLink(value: Route.tracks(project.publicId, project.name)) {
                                ProjectCard(name: project.name)
                            }
                        }
                    }
                    .padding(16)
                }
            }
        }
        .task(id: folderId) {
            loading = true
            async let f = app.apiClient.listFolders(parentId: Int64(folderId))
            async let p = app.apiClient.listProjects(folderId: folderId)
            folders = await f
            projects = await p
            loading = false
        }
    }
}

private struct FolderCard: View {
    let name: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "folder.fill").foregroundColor(Theme.accentBlue)
            Text(name).foregroundColor(Theme.text0).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Theme.bg1, in: RoundedRectangle(cornerRadius: 21))
    }
}

private struct ProjectCard: View {
    let name: String
    var body: some View {
        VStack {
            Spacer()
            Text(name)
                .foregroundColor(Theme.text0)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .aspectRatio(1, contentMode: .fit)
        .background(
            LinearGradient(colors: [Theme.bg2, Theme.bg1], startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: 24)
        )
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Theme.border0, lineWidth: 1))
    }
}

import SwiftUI

struct LoginView: View {
    @EnvironmentObject var app: AppModel
    @State private var username = ""
    @State private var password = ""
    @State private var loading = false
    @State private var error: String?

    var body: some View {
        ZStack {
            Theme.bg0.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                Text("arbiter")
                    .font(.largeTitle.bold())
                    .foregroundColor(Theme.text0)
                    .padding(.bottom, 12)

                TextField("아이디", text: $username)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding()
                    .background(Theme.bg2, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundColor(Theme.text0)

                SecureField("비밀번호", text: $password)
                    .padding()
                    .background(Theme.bg2, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundColor(Theme.text0)

                if let error {
                    Text(error).foregroundColor(.red).font(.footnote)
                }

                Button {
                    Task { await submit() }
                } label: {
                    HStack {
                        Spacer()
                        if loading {
                            ProgressView().tint(.white)
                        } else {
                            Text("로그인").foregroundColor(.white)
                        }
                        Spacer()
                    }
                    .padding()
                }
                .background(Theme.accentBlue, in: RoundedRectangle(cornerRadius: 16))
                .disabled(loading || username.isEmpty || password.isEmpty)
            }
            .padding(24)
        }
    }

    private func submit() async {
        error = nil
        loading = true
        let ok = await app.authClient.login(username: username, password: password)
        loading = false
        if ok {
            app.onLoginSuccess()
        } else {
            error = "로그인 실패"
        }
    }
}

import SwiftUI

/// Ported from frontend/src/styles.css design tokens (same source the Android app's
/// ui/theme/Color.kt uses), so all three clients look like the same product.
enum Theme {
    static let bg0 = Color(red: 0x18 / 255, green: 0x18 / 255, blue: 0x18 / 255)
    static let bg1 = Color(red: 0x19 / 255, green: 0x19 / 255, blue: 0x19 / 255)
    static let bg2 = Color(red: 0x20 / 255, green: 0x1F / 255, blue: 0x1F / 255)
    static let text0 = Color.white
    static let text1 = Color(red: 0x91 / 255, green: 0x91 / 255, blue: 0x91 / 255)
    static let accentBlue = Color(red: 0x00 / 255, green: 0x99 / 255, blue: 0xBB / 255)
    static let border0 = Color(red: 0x35 / 255, green: 0x33 / 255, blue: 0x33 / 255)
}

/// Liquid Glass (iOS 26+) with a graceful translucent-material fallback on older iOS, so the
/// app doesn't force anyone onto the very newest OS just to look right.
extension View {
    @ViewBuilder
    func arbiterGlass(cornerRadius: CGFloat = 20) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius))
        } else {
            self
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(Theme.border0, lineWidth: 1)
                )
        }
    }
}

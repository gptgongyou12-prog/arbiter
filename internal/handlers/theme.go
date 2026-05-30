package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"bungleware/vault/internal/apperr"
	"bungleware/vault/internal/db"
	"bungleware/vault/internal/httputil"
)

type ThemeHandler struct {
	themeDir string
	database *db.DB
}

func NewThemeHandler(database *db.DB, themeDir string) *ThemeHandler {
	os.MkdirAll(themeDir, 0755)
	return &ThemeHandler{themeDir: themeDir, database: database}
}

func (h *ThemeHandler) requireAdmin(r *http.Request) error {
	userID, err := httputil.RequireUserID(r)
	if err != nil {
		return apperr.NewUnauthorized("unauthorized")
	}
	user, err := h.database.Queries.GetUserByID(r.Context(), int64(userID))
	if err != nil || !user.IsAdmin {
		return apperr.NewForbidden("admin access required")
	}
	return nil
}

func (h *ThemeHandler) UploadTheme(w http.ResponseWriter, r *http.Request) error {
	if err := h.requireAdmin(r); err != nil { return err }
	r.ParseMultipartForm(64 << 20)
	file, _, err := r.FormFile("theme")
	if err != nil { return apperr.NewBadRequest("missing file") }
	defer file.Close()
	data, err := io.ReadAll(file)
	if err != nil { return apperr.NewBadRequest("read error") }
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil { return apperr.NewBadRequest("invalid zip") }
	tmp, err := os.MkdirTemp("", "vault-theme-*")
	if err != nil { return apperr.NewBadRequest("temp error") }
	defer os.RemoveAll(tmp)
	for _, f := range zr.File {
		if strings.Contains(f.Name, "..") { continue }
		dest := filepath.Join(tmp, f.Name)
		if f.FileInfo().IsDir() { os.MkdirAll(dest, 0755); continue }
		os.MkdirAll(filepath.Dir(dest), 0755)
		rc, _ := f.Open()
		content, _ := io.ReadAll(rc)
		rc.Close()
		ext := strings.ToLower(filepath.Ext(f.Name))
		if ext == ".jsx" || ext == ".tsx" {
			js, err := transpileJSX(string(content))
			if err != nil { return apperr.NewBadRequest("transpile error") }
			dest = strings.TrimSuffix(dest, filepath.Ext(dest)) + ".js"
			content = []byte(js)
		}
		os.WriteFile(dest, content, 0644)
	}
	// theme.json이 서브폴더에 있으면 그 폴더를 루트로 사용
	themeRoot := tmp
	if _, err := os.Stat(filepath.Join(tmp, "theme.json")); err != nil {
		if entries, err2 := os.ReadDir(tmp); err2 == nil {
			for _, e := range entries {
				if e.IsDir() {
					if _, err3 := os.Stat(filepath.Join(tmp, e.Name(), "theme.json")); err3 == nil {
						themeRoot = filepath.Join(tmp, e.Name())
						break
					}
				}
			}
		}
	}
	if _, err := os.Stat(filepath.Join(themeRoot, "theme.json")); err != nil {
		return apperr.NewBadRequest("theme.json missing")
	}
	os.RemoveAll(h.themeDir)
	os.MkdirAll(h.themeDir, 0755)
	if err := copyDir(themeRoot, h.themeDir); err != nil {
		return apperr.NewBadRequest("failed to save theme: " + err.Error())
	}
	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

func (h *ThemeHandler) DeleteTheme(w http.ResponseWriter, r *http.Request) error {
	if err := h.requireAdmin(r); err != nil { return err }
	os.RemoveAll(h.themeDir)
	os.MkdirAll(h.themeDir, 0755)
	return httputil.OKResult(w, map[string]string{"status": "ok"})
}

func (h *ThemeHandler) GetTheme(w http.ResponseWriter, r *http.Request) error {
	data, err := os.ReadFile(filepath.Join(h.themeDir, "theme.json"))
	if err != nil { return httputil.OKResult(w, nil) }
	var theme map[string]interface{}
	json.Unmarshal(data, &theme)
	if entries, err := os.ReadDir(filepath.Join(h.themeDir, "layouts")); err == nil {
		hasLayouts := map[string]bool{}
		for _, e := range entries { hasLayouts[strings.TrimSuffix(e.Name(), ".js")] = true }
		theme["_hasLayouts"] = hasLayouts
	}
	if _, err := os.Stat(filepath.Join(h.themeDir, "icons")); err == nil {
		theme["_hasIcons"] = true
	}
	return httputil.OKResult(w, theme)
}

func (h *ThemeHandler) ServeAsset(w http.ResponseWriter, r *http.Request) {
	p := strings.TrimPrefix(r.URL.Path, "/api/theme/asset/")
	if strings.Contains(p, "..") { http.Error(w, "invalid", 400); return }
	http.ServeFile(w, r, filepath.Join(h.themeDir, p))
}

func (h *ThemeHandler) ServeLayout(w http.ResponseWriter, r *http.Request) {
	c := r.PathValue("component")
	if strings.Contains(c, "..") { http.Error(w, "invalid", 400); return }
	n := strings.TrimSuffix(c, ".js") + ".js"
	w.Header().Set("Content-Type", "application/javascript")
	http.ServeFile(w, r, filepath.Join(h.themeDir, "layouts", n))
}

func transpileJSX(code string) (string, error) {
	code = regexp.MustCompile(`import.*@vault/core.*`).ReplaceAllString(code, "const {usePlayer,useAuth,useNavigate}=window.__VaultCore;")
	code = regexp.MustCompile(`import\s+React.*react.*`).ReplaceAllString(code, "const React=window.React;")
	tmp, _ := os.CreateTemp("", "*.jsx")
	defer os.Remove(tmp.Name())
	tmp.WriteString(code)
	tmp.Close()
	out := tmp.Name() + ".js"
	defer os.Remove(out)
	exec.Command("esbuild", tmp.Name(), "--format=esm", "--outfile="+out).Run()
	res, _ := os.ReadFile(out)
	return string(res), nil
}

func copyDir(src, dst string) error {
	return filepath.Walk(src, func(p string, info os.FileInfo, err error) error {
		if err != nil { return err }
		rel, _ := filepath.Rel(src, p)
		tgt := filepath.Join(dst, rel)
		if info.IsDir() { return os.MkdirAll(tgt, 0755) }
		d, _ := os.ReadFile(p)
		return os.WriteFile(tgt, d, 0644)
	})
}

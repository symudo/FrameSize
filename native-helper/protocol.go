package main

import (
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"math"
	"strings"
)

const (
	MaxMessageBytes     = 1024 * 1024 // 1 MB Native Messaging limit
	DefaultRollupHeight = 40          // Logical px height for title bar roll-up
	DefaultOpacityPct   = 82          // Translucent opacity percentage (50-95)
)

// HelperVersion can be overridden at build time via -ldflags "-X main.HelperVersion=x.y.z".
var HelperVersion = "1.3.0"

type Rect struct {
	Left   int `json:"left"`
	Top    int `json:"top"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

type Request struct {
	Action       string `json:"action"`
	Browser      string `json:"browser,omitempty"`
	Target       *Rect  `json:"target,omitempty"`
	RollupHeight int    `json:"rollupHeight,omitempty"`
	Opacity      int    `json:"opacity,omitempty"` // 50-95 percentage
}

type Response struct {
	OK          bool   `json:"ok"`
	Version     string `json:"version,omitempty"`
	Found       bool   `json:"found,omitempty"`
	Pinned      bool   `json:"pinned,omitempty"`
	RolledUp    bool   `json:"rolledUp,omitempty"`
	Translucent bool   `json:"translucent,omitempty"`
	Opacity     int    `json:"opacity,omitempty"`
	Title       string `json:"title,omitempty"`
	Error       string `json:"error,omitempty"`
}

type WindowCandidate struct {
	Handle      uintptr
	Title       string
	ProcessName string
	LogicalRect Rect
	PhysicalW   int
	PhysicalH   int
	DPI         int
	Minimized   bool
}

// ReadNativeMessage reads a Chrome/Firefox Native Messaging frame (4-byte LE uint32 length + JSON).
func ReadNativeMessage(r io.Reader) (*Request, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return nil, err
	}
	if length == 0 || length > MaxMessageBytes {
		return nil, errors.New("invalid native message length")
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return nil, err
	}
	var req Request
	if err := json.Unmarshal(payload, &req); err != nil {
		return nil, err
	}
	return &req, nil
}

// WriteNativeMessage writes a Native Messaging frame to stdout.
func WriteNativeMessage(w io.Writer, resp Response) error {
	payload, err := json.Marshal(resp)
	if err != nil {
		return err
	}
	if len(payload) > MaxMessageBytes {
		return errors.New("response exceeds native messaging limit")
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(payload))); err != nil {
		return err
	}
	_, err = w.Write(payload)
	return err
}

// IsDevToolsTitle checks common localized & English DevTools window titles across Chrome, Edge, and Firefox.
func IsDevToolsTitle(title string) bool {
	lower := strings.ToLower(strings.TrimSpace(title))
	if lower == "" {
		return false
	}
	keywords := []string{
		"devtools",
		"developer tools",
		"web developer tools",
		"开发者工具",
		"開發人員工具",
		"開発者ツール",
		"개발자 도구",
		"outils de développement",
		"entwicklertools",
		"herramientas para desarrolladores",
	}
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

// MatchesBrowserProcess filters process executables to avoid matching unrelated apps.
func MatchesBrowserProcess(procName, browser string) bool {
	p := strings.ToLower(strings.TrimSpace(procName))
	if p == "" {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(browser)) {
	case "chrome":
		return p == "chrome.exe" || p == "chromium.exe" || p == "brave.exe" || p == "vivaldi.exe"
	case "edge":
		return p == "msedge.exe"
	case "firefox":
		return p == "firefox.exe" || p == "librewolf.exe" || p == "zen.exe"
	default:
		return p == "chrome.exe" || p == "msedge.exe" || p == "firefox.exe" || p == "chromium.exe" || p == "brave.exe"
	}
}

// SelectBestCandidate picks the OS window that best matches the DevTools window reported by the browser extension.
func SelectBestCandidate(candidates []WindowCandidate, browser string, target *Rect) *WindowCandidate {
	var best *WindowCandidate
	bestScore := math.MaxFloat64

	for i := range candidates {
		c := &candidates[i]
		if !MatchesBrowserProcess(c.ProcessName, browser) {
			continue
		}

		isTitleMatch := IsDevToolsTitle(c.Title)
		if !isTitleMatch && target == nil {
			continue
		}

		score := 0.0
		if !isTitleMatch {
			// Strongly penalize non-DevTools title, only allow if geometry matches almost identically
			score += 2000
		}
		if c.Minimized {
			score += 500
		}

		if target != nil && target.Width > 0 && target.Height > 0 {
			dist := math.Abs(float64(c.LogicalRect.Left-target.Left)) +
				math.Abs(float64(c.LogicalRect.Top-target.Top)) +
				math.Abs(float64(c.LogicalRect.Width-target.Width)) +
				math.Abs(float64(c.LogicalRect.Height-target.Height))
			score += dist
			// Reject completely unrelated non-DevTools windows
			if !isTitleMatch && dist > 60 {
				continue
			}
		}

		if score < bestScore {
			bestScore = score
			best = c
		}
	}

	return best
}

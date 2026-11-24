package main

import (
	"bytes"
	"testing"
)

func TestNativeMessageRoundTrip(t *testing.T) {
	var buf bytes.Buffer
	orig := Response{
		OK:       true,
		Version:  HelperVersion,
		Found:    true,
		Pinned:   true,
		RolledUp: false,
		Title:    "DevTools - localhost:3000",
	}
	if err := WriteNativeMessage(&buf, orig); err != nil {
		t.Fatalf("WriteNativeMessage failed: %v", err)
	}
	if buf.Len() <= 4 {
		t.Fatalf("expected length-prefixed payload, got %d bytes", buf.Len())
	}

	// Also verify reading a Request frame
	var reqBuf bytes.Buffer
	rawReq := []byte(`{"action":"toggle_pin","browser":"edge","target":{"left":100,"top":80,"width":720,"height":640}}`)
	reqBuf.Write([]byte{byte(len(rawReq)), 0, 0, 0})
	reqBuf.Write(rawReq)

	req, err := ReadNativeMessage(&reqBuf)
	if err != nil {
		t.Fatalf("ReadNativeMessage failed: %v", err)
	}
	if req.Action != "toggle_pin" || req.Browser != "edge" || req.Target == nil || req.Target.Width != 720 {
		t.Fatalf("unexpected decoded request: %+v", req)
	}
}

func TestIsDevToolsTitle(t *testing.T) {
	cases := []struct {
		title string
		want  bool
	}{
		{"DevTools - http://localhost:5173/", true},
		{"开发者工具 - http://localhost:3000", true},
		{"Developer Tools - Example", true},
		{"Web Developer Tools", true},
		{"Google Chrome", false},
		{"FrameSize - Settings", false},
	}
	for _, tc := range cases {
		if got := IsDevToolsTitle(tc.title); got != tc.want {
			t.Errorf("IsDevToolsTitle(%q) = %v, want %v", tc.title, got, tc.want)
		}
	}
}

func TestSelectBestCandidate(t *testing.T) {
	candidates := []WindowCandidate{
		{
			Handle:      1,
			Title:       "localhost:3000 - Google Chrome",
			ProcessName: "chrome.exe",
			LogicalRect: Rect{Left: 0, Top: 0, Width: 1200, Height: 900},
		},
		{
			Handle:      2,
			Title:       "DevTools - localhost:3000",
			ProcessName: "chrome.exe",
			LogicalRect: Rect{Left: 1200, Top: 50, Width: 600, Height: 800},
		},
		{
			Handle:      3,
			Title:       "DevTools - docs.example.com",
			ProcessName: "chrome.exe",
			LogicalRect: Rect{Left: 200, Top: 200, Width: 500, Height: 500},
		},
	}

	target := &Rect{Left: 1204, Top: 52, Width: 598, Height: 800}
	picked := SelectBestCandidate(candidates, "chrome", target)
	if picked == nil || picked.Handle != 2 {
		t.Fatalf("expected handle 2, got %+v", picked)
	}

	// Browser filtering should skip chrome.exe when requesting firefox
	pickedFF := SelectBestCandidate(candidates, "firefox", target)
	if pickedFF != nil {
		t.Fatalf("expected nil for firefox, got %+v", pickedFF)
	}
}

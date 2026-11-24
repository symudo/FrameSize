//go:build windows

package main

import (
	"syscall"
	"testing"
	"unsafe"
)

var (
	procCreateWindowExW = user32.NewProc("CreateWindowExW")
	procDestroyWindow   = user32.NewProc("DestroyWindow")
	procShowWindow      = user32.NewProc("ShowWindow")
)

func TestRealWin32PinAndRollup(t *testing.T) {
	initPlatform()

	className, _ := syscall.UTF16PtrFromString("STATIC")
	title, _ := syscall.UTF16PtrFromString("DevTools - FrameSize Win32 Test")

	const (
		wsOverlappedWindow = 0x00CF0000
		swShowNA           = 8
	)

	hwnd, _, err := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(title)),
		wsOverlappedWindow,
		100, 100, 640, 480,
		0, 0, 0, 0,
	)
	if hwnd == 0 {
		t.Fatalf("CreateWindowExW failed: %v", err)
	}
	defer procDestroyWindow.Call(hwnd)
	procShowWindow.Call(hwnd, swShowNA)

	// 1. 验证置顶与取消置顶
	if isWindowPinned(hwnd) {
		t.Fatalf("expected newly created window not pinned")
	}
	if err := setWindowPinned(hwnd, true); err != nil {
		t.Fatalf("setWindowPinned(true) failed: %v", err)
	}
	if !isWindowPinned(hwnd) {
		t.Fatalf("expected window to be pinned (WS_EX_TOPMOST)")
	}
	if err := setWindowPinned(hwnd, false); err != nil {
		t.Fatalf("setWindowPinned(false) failed: %v", err)
	}
	if isWindowPinned(hwnd) {
		t.Fatalf("expected window to be unpinned")
	}

	// 2. 验证卷帘折叠与展开（SetWindowRgn）
	dpi := getWindowDPI(hwnd)
	if isWindowRolledUp(hwnd, dpi) {
		t.Fatalf("expected newly created window not rolled up")
	}
	if err := setWindowRolledUp(hwnd, true, 640, dpi, 40); err != nil {
		t.Fatalf("setWindowRolledUp(true) failed: %v", err)
	}
	if !isWindowRolledUp(hwnd, dpi) {
		t.Fatalf("expected window to report rolledUp=true after SetWindowRgn")
	}
	if err := setWindowRolledUp(hwnd, false, 640, dpi, 40); err != nil {
		t.Fatalf("setWindowRolledUp(false) failed: %v", err)
	}
	if isWindowRolledUp(hwnd, dpi) {
		t.Fatalf("expected window to report rolledUp=false after reset")
	}

	// 3. 验证半透明切换与还原（WS_EX_LAYERED + SetLayeredWindowAttributes）
	if trans, pct := getWindowOpacity(hwnd); trans || pct != 100 {
		t.Fatalf("expected initial opacity 100%%, got trans=%v pct=%d", trans, pct)
	}
	if err := setWindowOpacity(hwnd, true, 80); err != nil {
		t.Fatalf("setWindowOpacity(true, 80) failed: %v", err)
	}
	if trans, pct := getWindowOpacity(hwnd); !trans || pct < 78 || pct > 82 {
		t.Fatalf("expected translucent ~80%%, got trans=%v pct=%d", trans, pct)
	}
	if err := setWindowOpacity(hwnd, false, 100); err != nil {
		t.Fatalf("setWindowOpacity(false) failed: %v", err)
	}
	if trans, pct := getWindowOpacity(hwnd); trans || pct != 100 {
		t.Fatalf("expected restored opacity 100%%, got trans=%v pct=%d", trans, pct)
	}
}

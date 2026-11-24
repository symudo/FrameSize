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
)

func TestRealWin32PinCollapseAndOpacity(t *testing.T) {
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

	// 1. 置顶与取消置顶
	if isWindowPinned(hwnd) {
		t.Fatalf("expected newly created window not pinned")
	}
	if err := setWindowPinned(hwnd, true); err != nil {
		t.Fatalf("setWindowPinned(true) failed: %v", err)
	}
	if !isWindowPinned(hwnd) {
		t.Fatalf("expected window to be pinned (WS_EX_TOPMOST)")
	}

	// 2. 干净收起（最小化）与展开（且自动保留置顶状态）
	if isWindowCollapsed(hwnd) {
		t.Fatalf("expected window not collapsed initially")
	}
	if err := setWindowCollapsed(hwnd, true); err != nil {
		t.Fatalf("setWindowCollapsed(true) failed: %v", err)
	}
	if !isWindowCollapsed(hwnd) {
		t.Fatalf("expected window to be collapsed (iconic)")
	}
	if err := setWindowCollapsed(hwnd, false); err != nil {
		t.Fatalf("setWindowCollapsed(false) failed: %v", err)
	}
	if isWindowCollapsed(hwnd) {
		t.Fatalf("expected window expanded after restore")
	}
	if !isWindowPinned(hwnd) {
		t.Fatalf("expected Always-on-Top preserved after expand")
	}

	if err := setWindowPinned(hwnd, false); err != nil {
		t.Fatalf("setWindowPinned(false) failed: %v", err)
	}
	if isWindowPinned(hwnd) {
		t.Fatalf("expected window unpinned")
	}

	// 3. 半透明切换与还原
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

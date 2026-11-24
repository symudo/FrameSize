//go:build windows

package main

import (
	"fmt"
	"math"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procEnumWindows                  = user32.NewProc("EnumWindows")
	procIsWindowVisible              = user32.NewProc("IsWindowVisible")
	procIsIconic                     = user32.NewProc("IsIconic")
	procGetWindowTextW               = user32.NewProc("GetWindowTextW")
	procGetWindowTextLengthW         = user32.NewProc("GetWindowTextLengthW")
	procGetWindowRect                = user32.NewProc("GetWindowRect")
	procGetWindowLongPtrW            = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW            = user32.NewProc("SetWindowLongPtrW")
	procGetLayeredWindowAttributes   = user32.NewProc("GetLayeredWindowAttributes")
	procSetLayeredWindowAttributes   = user32.NewProc("SetLayeredWindowAttributes")
	procSetWindowPos                 = user32.NewProc("SetWindowPos")
	procSetWindowRgn                 = user32.NewProc("SetWindowRgn")
	procGetWindowRgnBox              = user32.NewProc("GetWindowRgnBox")
	procRedrawWindow                 = user32.NewProc("RedrawWindow")
	procGetWindowThreadProcessId     = user32.NewProc("GetWindowThreadProcessId")
	procGetDpiForWindow              = user32.NewProc("GetDpiForWindow")
	procSetProcessDpiAwarenessCtx    = user32.NewProc("SetProcessDpiAwarenessContext")
	procCreateRectRgn                = gdi32.NewProc("CreateRectRgn")
	procDeleteObject                 = gdi32.NewProc("DeleteObject")
	procOpenProcess                  = kernel32.NewProc("OpenProcess")
	procCloseHandle                  = kernel32.NewProc("CloseHandle")
	procQueryFullProcessImageNameW   = kernel32.NewProc("QueryFullProcessImageNameW")
)

const (
	wsExTopmost                   = 0x00000008
	wsExLayered                   = 0x00080000
	lwaAlpha                      = 0x00000002
	swpNoSize                     = 0x0001
	swpNoMove                     = 0x0002
	swpNoActivate                 = 0x0010
	swpFrameChanged               = 0x0020
	rdwInvalidate                 = 0x0001
	rdwErase                      = 0x0004
	rdwAllChildren                = 0x0080
	rdwUpdateNow                  = 0x0100
	rdwFrame                      = 0x0400
	processQueryLimitedInfo       = 0x1000
	rgnError                      = 0
	rgnSimple                     = 2
	maxRolledUpLogicalThresholdPx = 72
)

var (
	gwlExStyle    = ^uintptr(19) // GWL_EXSTYLE (-20)
	hwndTopmost   = ^uintptr(0)  // (HWND)-1
	hwndNoTopmost = ^uintptr(1)  // (HWND)-2
	dpiAwareV2    = ^uintptr(3)  // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 (-4)
)

type winRect struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

func initPlatform() {
	if procSetProcessDpiAwarenessCtx.Find() == nil {
		procSetProcessDpiAwarenessCtx.Call(dpiAwareV2)
	}
}

func getWindowDPI(hwnd uintptr) int {
	if procGetDpiForWindow.Find() == nil {
		dpi, _, _ := procGetDpiForWindow.Call(hwnd)
		if dpi >= 72 && dpi <= 480 {
			return int(dpi)
		}
	}
	return 96
}

func getWindowTitle(hwnd uintptr) string {
	n, _, _ := procGetWindowTextLengthW.Call(hwnd)
	if n == 0 {
		return ""
	}
	buf := make([]uint16, n+1)
	procGetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(&buf[0])), n+1)
	return syscall.UTF16ToString(buf)
}

func getWindowProcessName(hwnd uintptr) string {
	var pid uint32
	procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 {
		return ""
	}
	hProc, _, _ := procOpenProcess.Call(processQueryLimitedInfo, 0, uintptr(pid))
	if hProc == 0 {
		return ""
	}
	defer procCloseHandle.Call(hProc)

	buf := make([]uint16, 512)
	size := uint32(len(buf))
	ret, _, _ := procQueryFullProcessImageNameW.Call(
		hProc,
		0,
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(unsafe.Pointer(&size)),
	)
	if ret == 0 {
		return ""
	}
	fullPath := syscall.UTF16ToString(buf[:size])
	return filepath.Base(fullPath)
}

func getWindowPhysicalRect(hwnd uintptr) (winRect, bool) {
	var rc winRect
	ret, _, _ := procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
	return rc, ret != 0
}

func enumerateWindows() []WindowCandidate {
	var list []WindowCandidate
	cb := syscall.NewCallback(func(hwnd uintptr, _ uintptr) uintptr {
		visible, _, _ := procIsWindowVisible.Call(hwnd)
		if visible == 0 {
			return 1
		}
		title := getWindowTitle(hwnd)
		if title == "" {
			return 1
		}
		procName := getWindowProcessName(hwnd)
		rc, ok := getWindowPhysicalRect(hwnd)
		if !ok {
			return 1
		}
		dpi := getWindowDPI(hwnd)
		scale := float64(dpi) / 96.0
		physW := int(rc.Right - rc.Left)
		physH := int(rc.Bottom - rc.Top)
		iconic, _, _ := procIsIconic.Call(hwnd)

		list = append(list, WindowCandidate{
			Handle:      hwnd,
			Title:       title,
			ProcessName: procName,
			LogicalRect: Rect{
				Left:   int(math.Round(float64(rc.Left) / scale)),
				Top:    int(math.Round(float64(rc.Top) / scale)),
				Width:  int(math.Round(float64(physW) / scale)),
				Height: int(math.Round(float64(physH) / scale)),
			},
			PhysicalW: physW,
			PhysicalH: physH,
			DPI:       dpi,
			Minimized: iconic != 0,
		})
		return 1
	})
	procEnumWindows.Call(cb, 0)
	return list
}

func isWindowPinned(hwnd uintptr) bool {
	style, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
	return (style & wsExTopmost) != 0
}

func setWindowPinned(hwnd uintptr, pin bool) error {
	insertAfter := hwndNoTopmost
	if pin {
		insertAfter = hwndTopmost
	}
	ret, _, err := procSetWindowPos.Call(
		hwnd,
		insertAfter,
		0, 0, 0, 0,
		swpNoMove|swpNoSize|swpNoActivate,
	)
	if ret == 0 {
		return fmt.Errorf("SetWindowPos failed: %w", err)
	}
	return nil
}

func isWindowRolledUp(hwnd uintptr, dpi int) bool {
	var rc winRect
	regionType, _, _ := procGetWindowRgnBox.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
	if regionType == rgnError {
		return false
	}
	scale := float64(dpi) / 96.0
	logicalH := float64(rc.Bottom-rc.Top) / scale
	return regionType == rgnSimple && logicalH > 0 && logicalH <= maxRolledUpLogicalThresholdPx
}

func setWindowRolledUp(hwnd uintptr, rollUp bool, physW, dpi, logicalHeight int) error {
	if !rollUp {
		ret, _, err := procSetWindowRgn.Call(hwnd, 0, 1)
		if ret == 0 {
			return fmt.Errorf("SetWindowRgn reset failed: %w", err)
		}
		procRedrawWindow.Call(hwnd, 0, 0, rdwInvalidate|rdwErase|rdwFrame|rdwAllChildren|rdwUpdateNow)
		return nil
	}

	if logicalHeight < 28 || logicalHeight > 64 {
		logicalHeight = DefaultRollupHeight
	}
	scale := float64(dpi) / 96.0
	physH := int(math.Round(float64(logicalHeight) * scale))
	if physH < 28 {
		physH = 28
	}
	if physW <= 0 {
		rc, ok := getWindowPhysicalRect(hwnd)
		if ok {
			physW = int(rc.Right - rc.Left)
		}
	}

	hRgn, _, err := procCreateRectRgn.Call(0, 0, uintptr(physW), uintptr(physH))
	if hRgn == 0 {
		return fmt.Errorf("CreateRectRgn failed: %w", err)
	}
	// On success, the OS owns hRgn and must not be deleted by caller;
	// on failure, caller must free hRgn to avoid GDI handle leak.
	ret, _, err := procSetWindowRgn.Call(hwnd, hRgn, 1)
	if ret == 0 {
		procDeleteObject.Call(hRgn)
		return fmt.Errorf("SetWindowRgn apply failed: %w", err)
	}
	procRedrawWindow.Call(hwnd, 0, 0, rdwInvalidate|rdwFrame|rdwUpdateNow)
	return nil
}

func getWindowOpacity(hwnd uintptr) (translucent bool, pct int) {
	style, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
	if (style & wsExLayered) == 0 {
		return false, 100
	}
	var alpha byte
	var flags uint32
	ret, _, _ := procGetLayeredWindowAttributes.Call(
		hwnd,
		0,
		uintptr(unsafe.Pointer(&alpha)),
		uintptr(unsafe.Pointer(&flags)),
	)
	if ret == 0 || (flags&lwaAlpha) == 0 {
		return false, 100
	}
	percent := int(math.Round(float64(alpha) * 100.0 / 255.0))
	if percent >= 98 {
		return false, 100
	}
	return true, percent
}

func setWindowOpacity(hwnd uintptr, translucent bool, targetPct int) error {
	style, _, _ := procGetWindowLongPtrW.Call(hwnd, gwlExStyle)
	if !translucent {
		if (style & wsExLayered) != 0 {
			procSetLayeredWindowAttributes.Call(hwnd, 0, 255, lwaAlpha)
			procSetWindowLongPtrW.Call(hwnd, gwlExStyle, style&^wsExLayered)
			procRedrawWindow.Call(hwnd, 0, 0, rdwInvalidate|rdwErase|rdwFrame|rdwAllChildren|rdwUpdateNow)
		}
		return nil
	}

	if targetPct < 45 || targetPct > 95 {
		targetPct = DefaultOpacityPct
	}
	alpha := byte(math.Round(float64(targetPct) * 255.0 / 100.0))
	if alpha < 110 {
		alpha = 110
	}

	addedLayered := false
	if (style & wsExLayered) == 0 {
		procSetWindowLongPtrW.Call(hwnd, gwlExStyle, style|wsExLayered)
		addedLayered = true
	}
	ret, _, err := procSetLayeredWindowAttributes.Call(hwnd, 0, uintptr(alpha), lwaAlpha)
	if ret == 0 {
		if addedLayered {
			procSetWindowLongPtrW.Call(hwnd, gwlExStyle, style)
		}
		return fmt.Errorf("SetLayeredWindowAttributes failed: %w", err)
	}
	return nil
}

func handlePlatformRequest(req *Request) Response {
	if req.Action == "ping" {
		return Response{OK: true, Version: HelperVersion}
	}

	candidates := enumerateWindows()
	win := SelectBestCandidate(candidates, req.Browser, req.Target)
	if win == nil {
		return Response{
			OK:      true,
			Version: HelperVersion,
			Found:   false,
		}
	}

	pinned := isWindowPinned(win.Handle)
	rolledUp := isWindowRolledUp(win.Handle, win.DPI)
	translucent, opacity := getWindowOpacity(win.Handle)

	switch req.Action {
	case "get_status":
		return Response{
			OK:          true,
			Version:     HelperVersion,
			Found:       true,
			Pinned:      pinned,
			RolledUp:    rolledUp,
			Translucent: translucent,
			Opacity:     opacity,
			Title:       win.Title,
		}

	case "toggle_pin":
		next := !pinned
		if err := setWindowPinned(win.Handle, next); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		return Response{
			OK:          true,
			Version:     HelperVersion,
			Found:       true,
			Pinned:      isWindowPinned(win.Handle),
			RolledUp:    rolledUp,
			Translucent: translucent,
			Opacity:     opacity,
			Title:       win.Title,
		}

	case "set_pin":
		if err := setWindowPinned(win.Handle, true); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		return Response{
			OK:          true,
			Version:     HelperVersion,
			Found:       true,
			Pinned:      isWindowPinned(win.Handle),
			RolledUp:    rolledUp,
			Translucent: translucent,
			Opacity:     opacity,
			Title:       win.Title,
		}

	case "toggle_rollup":
		next := !rolledUp
		if err := setWindowRolledUp(win.Handle, next, win.PhysicalW, win.DPI, req.RollupHeight); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		// 折叠成标题栏浮条时，自动确保其置顶以免被浏览器挡住
		if next && !pinned {
			_ = setWindowPinned(win.Handle, true)
		}
		return Response{
			OK:          true,
			Version:     HelperVersion,
			Found:       true,
			Pinned:      isWindowPinned(win.Handle),
			RolledUp:    isWindowRolledUp(win.Handle, win.DPI),
			Translucent: translucent,
			Opacity:     opacity,
			Title:       win.Title,
		}

	case "toggle_opacity":
		next := !translucent
		if err := setWindowOpacity(win.Handle, next, req.Opacity); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		// 开启半透明透视时自动确保置顶，否则藏在底层失去透视意义
		if next && !pinned {
			_ = setWindowPinned(win.Handle, true)
		}
		nowTrans, nowOpacity := getWindowOpacity(win.Handle)
		return Response{
			OK:          true,
			Version:     HelperVersion,
			Found:       true,
			Pinned:      isWindowPinned(win.Handle),
			RolledUp:    rolledUp,
			Translucent: nowTrans,
			Opacity:     nowOpacity,
			Title:       win.Title,
		}

	default:
		return Response{OK: false, Error: "unknown action: " + req.Action}
	}
}

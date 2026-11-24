//go:build windows

package main

import (
	"fmt"
	"math"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procEnumWindows                = user32.NewProc("EnumWindows")
	procIsWindowVisible            = user32.NewProc("IsWindowVisible")
	procIsIconic                   = user32.NewProc("IsIconic")
	procIsZoomed                   = user32.NewProc("IsZoomed")
	procShowWindow                 = user32.NewProc("ShowWindow")
	procGetWindowTextW             = user32.NewProc("GetWindowTextW")
	procGetWindowTextLengthW       = user32.NewProc("GetWindowTextLengthW")
	procGetWindowRect              = user32.NewProc("GetWindowRect")
	procGetWindowLongPtrW          = user32.NewProc("GetWindowLongPtrW")
	procSetWindowLongPtrW          = user32.NewProc("SetWindowLongPtrW")
	procGetLayeredWindowAttributes = user32.NewProc("GetLayeredWindowAttributes")
	procSetLayeredWindowAttributes = user32.NewProc("SetLayeredWindowAttributes")
	procSetWindowPos               = user32.NewProc("SetWindowPos")
	procRedrawWindow               = user32.NewProc("RedrawWindow")
	procGetWindowThreadProcessId   = user32.NewProc("GetWindowThreadProcessId")
	procGetDpiForWindow            = user32.NewProc("GetDpiForWindow")
	procSetProcessDpiAwarenessCtx  = user32.NewProc("SetProcessDpiAwarenessContext")
	procOpenProcess                = kernel32.NewProc("OpenProcess")
	procCloseHandle                = kernel32.NewProc("CloseHandle")
	procQueryFullProcessImageNameW = kernel32.NewProc("QueryFullProcessImageNameW")
)

const (
	wsExTopmost             = 0x00000008
	wsExLayered             = 0x00080000
	lwaAlpha                = 0x00000002
	swpNoSize               = 0x0001
	swpNoMove               = 0x0002
	swpNoZOrder             = 0x0004
	swpNoActivate           = 0x0010
	swMinimize              = 6
	swRestore               = 9
	swShowNoActivate        = 4
	rdwInvalidate           = 0x0001
	rdwErase                = 0x0004
	rdwAllChildren          = 0x0080
	rdwUpdateNow            = 0x0100
	rdwFrame                = 0x0400
	processQueryLimitedInfo = 0x1000
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

func isWindowCollapsed(hwnd uintptr) bool {
	iconic, _, _ := procIsIconic.Call(hwnd)
	return iconic != 0
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
			Minimized: isWindowCollapsed(hwnd),
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

// setWindowCollapsed cleanly minimizes the DevTools window (zero DWM ghost borders)
// or restores it back to its original placement while preserving Always-on-Top state.
func setWindowCollapsed(hwnd uintptr, collapse bool) error {
	if collapse {
		procShowWindow.Call(hwnd, swMinimize)
		// 跨进程调用 ShowWindow 是异步投递，短暂等待 Iconic 状态落定（最多 150ms）
		for i := 0; i < 10; i++ {
			if isWindowCollapsed(hwnd) {
				break
			}
			time.Sleep(15 * time.Millisecond)
		}
		return nil
	}

	wasPinned := isWindowPinned(hwnd)
	procShowWindow.Call(hwnd, swShowNoActivate)
	if isWindowCollapsed(hwnd) {
		procShowWindow.Call(hwnd, swRestore)
	}
	for i := 0; i < 10; i++ {
		if !isWindowCollapsed(hwnd) {
			break
		}
		time.Sleep(15 * time.Millisecond)
	}
	if wasPinned {
		_ = setWindowPinned(hwnd, true)
	}
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

func moveResizeWindow(hwnd uintptr, dpi int, logical Rect) error {
	if isWindowCollapsed(hwnd) {
		_ = setWindowCollapsed(hwnd, false)
	}
	if zoomed, _, _ := procIsZoomed.Call(hwnd); zoomed != 0 {
		procShowWindow.Call(hwnd, swRestore)
	}
	scale := float64(dpi) / 96.0
	x := int(math.Round(float64(logical.Left) * scale))
	y := int(math.Round(float64(logical.Top) * scale))
	w := int(math.Round(float64(logical.Width) * scale))
	h := int(math.Round(float64(logical.Height) * scale))
	if w < 200 {
		w = 200
	}
	if h < 200 {
		h = 200
	}

	ret, _, err := procSetWindowPos.Call(
		hwnd,
		0,
		uintptr(x),
		uintptr(y),
		uintptr(w),
		uintptr(h),
		swpNoZOrder|swpNoActivate,
	)
	if ret == 0 {
		return fmt.Errorf("SetWindowPos move failed: %w", err)
	}
	return nil
}

func buildStatusResponse(win *WindowCandidate) Response {
	pinned := isWindowPinned(win.Handle)
	collapsed := isWindowCollapsed(win.Handle)
	translucent, opacity := getWindowOpacity(win.Handle)
	return Response{
		OK:          true,
		Version:     HelperVersion,
		Found:       true,
		Pinned:      pinned,
		Collapsed:   collapsed,
		Translucent: translucent,
		Opacity:     opacity,
		Title:       win.Title,
	}
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

	switch req.Action {
	case "get_status":
		return buildStatusResponse(win)

	case "toggle_pin":
		if isWindowCollapsed(win.Handle) {
			_ = setWindowCollapsed(win.Handle, false)
		}
		next := !isWindowPinned(win.Handle)
		if err := setWindowPinned(win.Handle, next); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		return buildStatusResponse(win)

	case "toggle_collapse":
		next := !isWindowCollapsed(win.Handle)
		if err := setWindowCollapsed(win.Handle, next); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		return buildStatusResponse(win)

	case "expand":
		if isWindowCollapsed(win.Handle) {
			if err := setWindowCollapsed(win.Handle, false); err != nil {
				return Response{OK: false, Error: err.Error()}
			}
		}
		return buildStatusResponse(win)

	case "toggle_opacity":
		if isWindowCollapsed(win.Handle) {
			_ = setWindowCollapsed(win.Handle, false)
		}
		curTrans, _ := getWindowOpacity(win.Handle)
		next := !curTrans
		if err := setWindowOpacity(win.Handle, next, req.Opacity); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		if next && !isWindowPinned(win.Handle) {
			_ = setWindowPinned(win.Handle, true)
		}
		return buildStatusResponse(win)

	case "move_resize":
		if req.MoveRect == nil {
			return Response{OK: false, Error: "missing moveRect"}
		}
		if err := moveResizeWindow(win.Handle, win.DPI, *req.MoveRect); err != nil {
			return Response{OK: false, Error: err.Error()}
		}
		return buildStatusResponse(win)

	default:
		return Response{OK: false, Error: "unknown action: " + req.Action}
	}
}

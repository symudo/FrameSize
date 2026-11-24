//go:build !windows

package main

func initPlatform() {}

func handlePlatformRequest(req *Request) Response {
	if req.Action == "ping" {
		return Response{OK: true, Version: HelperVersion}
	}
	return Response{
		OK:    false,
		Error: "FrameSize Native Helper is currently supported on Windows only",
	}
}

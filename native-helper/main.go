package main

import (
	"fmt"
	"io"
	"os"
)

func main() {
	initPlatform()

	if len(os.Args) > 1 && os.Args[1] == "--version" {
		fmt.Printf("framesize-helper %s\n", HelperVersion)
		return
	}

	// Chrome/Edge/Firefox Native Messaging stdio loop
	for {
		req, err := ReadNativeMessage(os.Stdin)
		if err != nil {
			if err == io.EOF {
				return
			}
			_ = WriteNativeMessage(os.Stdout, Response{OK: false, Error: err.Error()})
			return
		}

		resp := handlePlatformRequest(req)
		if err := WriteNativeMessage(os.Stdout, resp); err != nil {
			return
		}
	}
}

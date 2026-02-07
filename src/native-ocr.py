import sys
try:
    from AppKit import NSImage
    import Vision
    import Quartz
except ImportError:
    print('Error: Missing pyobjc-framework-Vision or AppKit')
    sys.exit(1)

def ocr_image(file_path):
    try:
        image = NSImage.alloc().initWithContentsOfFile_(file_path)
        if not image:
            return 'Error: Could not load image'
        
        cg_image = image.CGImageForProposedRect_context_hints_(None, None, None)[0]
        request_handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(cg_image, None)
        request = Vision.VNRecognizeTextRequest.alloc().init()
        request.setRecognitionLevel_(Vision.VNRequestTextRecognitionLevelAccurate)
        
        success, error = request_handler.performRequests_error_([request], None)
        if not success:
            return f'Error: {error}'
        
        results = request.results()
        text_parts = []
        for result in results:
            candidates = result.topCandidates_(1)
            if candidates:
                text_parts.append(candidates[0].string())
        
        return '\n'.join(text_parts)
    except Exception as e:
        return f'Error: {str(e)}'

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(1)
    print(ocr_image(sys.argv[1]))

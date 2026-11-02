/** Vietnamese editor UI, including upstream 1.7.8 commands and palettes. */
export default {
  mainMenu: {
    new: 'Bản vẽ mới',
    template: 'Sinh bản vẽ từ template',
    open: 'Mở bản vẽ',
    drawingUnits: 'Đơn vị bản vẽ',
    exportMenu: 'Xuất',
    export: 'Xuất ra DXF',
    exportHtml: 'Xuất ra HTML',
    exportPdf: 'Xuất ra PDF',
    exportSvg: 'Xuất ra SVG',
    exportImage: 'Xuất ra ảnh',
    about: 'Giới thiệu',
    standards: 'Nền chuẩn hóa'
  },
  ribbon: {
    tab: {
      home: 'Trang chính',
      insert: 'Chèn',
      review: 'Rà soát',
      measurement: 'Đo đạc',
      hatchContext: 'Hatch',
      mtextEditorContext: 'Soạn chữ'
    },
    hatch: {
      group: {
        boundary: 'Biên',
        pattern: 'Mẫu',
        properties: 'Thuộc tính',
        options: 'Tùy chọn',
        close: 'Đóng'
      },
      command: {
        pickPoints: 'Chọn điểm',
        selectObjects: 'Chọn đối tượng',
        close: 'Đóng'
      },
      field: {
        pattern: 'Mẫu',
        scale: 'Tỉ lệ',
        angle: 'Góc',
        style: 'Kiểu',
        associative: 'Liên kết',
        fillType: 'Kiểu tô',
        fillColor: 'Màu',
        patternColor: 'Màu mẫu',
        gradient1Color: 'Màu chuyển sắc 1',
        backgroundColor: 'Màu nền',
        gradient2Color: 'Màu chuyển sắc 2',
        opacity: 'Độ trong suốt',
        imageScale: 'Tỉ lệ ảnh'
      },
      style: {
        normal: 'Thường',
        outer: 'Ngoài cùng',
        ignore: 'Bỏ qua'
      },
      fillType: {
        solid: 'Đặc',
        pattern: 'Theo mẫu',
        gradient: 'Chuyển sắc'
      },
      associative: {
        on: 'Bật',
        off: 'Tắt'
      },
      tooltip: {
        pickPoints: 'Chọn điểm bên trong vùng kín để tạo hatch.',
        selectObjects: 'Chọn đối tượng biên kín để tô hatch.',
        pattern: 'Chọn tên mẫu hatch.',
        scale: 'Đặt tỉ lệ mẫu hatch.',
        angle: 'Đặt góc nghiêng của mẫu hatch, tính bằng độ.',
        style: 'Cách xử lý vùng lồng nhau khi tạo hatch.',
        associative: 'Bật/tắt chế độ hatch liên kết với biên.',
        fillType: 'Chọn kiểu tô: đặc, theo mẫu hoặc chuyển sắc.',
        fillColor: 'Chọn màu tô.',
        patternColor: 'Chọn màu nét của mẫu.',
        gradient1Color: 'Chọn màu chuyển sắc thứ nhất.',
        backgroundColor: 'Chọn màu nền cho kiểu tô theo mẫu.',
        gradient2Color: 'Chọn màu chuyển sắc thứ hai.',
        opacity: 'Đặt độ trong suốt của hatch (0–90).',
        imageScale: 'Đặt tỉ lệ ảnh tô.',
        close: 'Thoát tạo hatch và đóng thẻ ngữ cảnh này.'
      }
    },
    mtext: {
      group: {
        textStyle: 'Kiểu chữ',
        format: 'Định dạng',
        paragraph: 'Đoạn',
        insert: 'Chèn',
        close: 'Đóng'
      },
      field: {
        textStyle: 'Kiểu chữ',
        font: 'Phông',
        color: 'Màu',
        height: 'Chiều cao',
        obliqueAngle: 'Góc nghiêng',
        tracking: 'Giãn ký tự',
        widthFactor: 'Hệ số bề rộng'
      },
      characterMap: {
        title: 'Bảng ký tự',
        font: 'Phông (F):',
        charsToCopy: 'Ký tự cần chép (A):',
        select: 'Chọn (S)',
        copy: 'Chép (C)',
        noGlyphs: 'Phông này không có ký tự nào dùng được.',
        copyFailed: 'Không chép được vào bộ nhớ tạm.'
      },
      command: {
        bold: 'Đậm',
        underline: 'Gạch chân',
        superscript: 'Chỉ số trên',
        italic: 'Nghiêng',
        overline: 'Gạch trên',
        subscript: 'Chỉ số dưới',
        strikethrough: 'Gạch ngang',
        stack: 'Xếp chồng',
        toggleCase: 'Chữ hoa/thường',
        attachment: 'Căn lề',
        list: 'Đánh dấu và đánh số',
        lineSpacing: 'Giãn dòng',
        paragraphAlignment: 'Căn đoạn',
        symbol: 'Ký hiệu',
        close: 'Đóng'
      },
      tooltip: {
        textStyle: 'Chọn kiểu chữ có sẵn trong bản vẽ hiện tại.',
        bold: 'Bật/tắt chữ đậm.',
        underline: 'Bật/tắt gạch chân.',
        superscript: 'Bật/tắt chỉ số trên.',
        italic: 'Bật/tắt chữ nghiêng.',
        overline: 'Bật/tắt gạch trên.',
        subscript: 'Bật/tắt chỉ số dưới.',
        strikethrough: 'Bật/tắt gạch ngang.',
        stack: 'Xếp chồng hoặc bỏ xếp chồng phần chữ dạng phân số.',
        toggleCase: 'Đổi phần chữ đang chọn giữa chữ hoa và chữ thường.',
        font: 'Đặt phông chữ hiện hành.',
        color: 'Đặt màu chữ hiện hành.',
        height: 'Đặt chiều cao chữ hiện hành. Cho phép nhập giá trị tùy ý.',
        obliqueAngle:
          'Đặt góc nghiêng theo độ cho các ký tự đang chọn (số âm nghiêng về phía ngược lại).',
        tracking:
          'Tăng hoặc giảm khoảng cách giữa các ký tự đang chọn (mặc định là 1).',
        widthFactor:
          'Kéo giãn hoặc nén các ký tự đang chọn theo phương ngang (mặc định là 1).',
        attachment: 'Đặt điểm neo của đoạn chữ nhiều dòng.',
        list: 'Chèn hoặc thiết lập dấu đầu dòng và đánh số.',
        lineSpacing: 'Đặt khoảng cách giữa các dòng.',
        paragraphAlignment: 'Đặt cách căn ngang cho đoạn.',
        symbol: 'Chèn một ký hiệu thường dùng trong bản vẽ kỹ thuật.',
        close: 'Đóng trình soạn chữ và thẻ ngữ cảnh này.'
      },
      attachment: {
        TL: 'Trên trái TL',
        TC: 'Trên giữa TC',
        TR: 'Trên phải TR',
        ML: 'Giữa trái ML',
        MC: 'Chính giữa MC',
        MR: 'Giữa phải MR',
        BL: 'Dưới trái BL',
        BC: 'Dưới giữa BC',
        BR: 'Dưới phải BR'
      },
      list: {
        off: 'Tắt',
        number: 'Đánh số',
        letter: 'Đánh chữ cái',
        bullet: 'Dấu đầu dòng',
        start: 'Bắt đầu lại',
        continue: 'Đánh tiếp',
        auto: 'Cho phép tự đánh dấu và đánh số',
        allowList: 'Cho phép dấu đầu dòng và danh sách'
      },
      lineSpacing: {
        more: 'Thêm...',
        clear: 'Bỏ giãn cách đoạn'
      },
      paragraphAlign: {
        default: 'Mặc định',
        left: 'Trái',
        center: 'Giữa',
        right: 'Phải',
        justified: 'Đều hai bên',
        distributed: 'Dàn đều'
      },
      symbol: {
        degree: 'Độ  %%d',
        plusMinus: 'Cộng/trừ  %%p',
        diameter: 'Đường kính  %%c',
        almostEqual: 'Xấp xỉ  \\U+2248',
        angle: 'Góc  \\U+2220',
        boundary: 'Đường biên  \\U+E100',
        centerLine: 'Đường tim  \\U+2104',
        delta: 'Delta  \\U+0394',
        electricalPhase: 'Pha điện  \\U+0278',
        flowLine: 'Đường dòng chảy  \\U+E101',
        identical: 'Đồng nhất  \\U+2261',
        notEqual: 'Khác  \\U+2260',
        ohm: 'Ôm  \\U+2126',
        omega: 'Ômêga  \\U+03A9',
        propertyLine: 'Ranh giới thửa  \\U+214A',
        subscriptTwo: 'Chỉ số dưới 2  \\U+2082',
        squared: 'Bình phương  \\U+00B2',
        cubed: 'Lập phương  \\U+00B3',
        nbsp: 'Dấu cách không ngắt  Ctrl+Shift+Space',
        other: 'Khác...'
      }
    },
    group: {
      draw: 'Vẽ',
      dimension: 'Kích thước',
      modify: 'Sửa',
      layer: 'Layer',
      properties: 'Thuộc tính',
      utilities: 'Tiện ích',
      annotation: 'Ghi chú',
      review: 'Rà soát',
      measurement: 'Đo đạc',
      style: 'Kiểu',
      lengthUnits: 'Đơn vị chiều dài',
      angleUnits: 'Đơn vị góc',
      reference: 'Tham chiếu',
      block: 'Block'
    },
    insertBlock: {
      empty: 'Không có block nào',
      currentDrawing: 'Bản vẽ hiện tại',
      previewMenu: 'Thư viện xem trước block'
    },
    property: {
      color: 'Màu',
      lineType: 'Kiểu nét',
      lineWeight: 'Bề dày nét'
    },
    layerTools: {
      select: 'Layer',
      off: 'Tắt layer',
      isolate: 'Tách riêng',
      freeze: 'Đóng băng layer',
      lock: 'Khóa layer',
      current: 'Đặt hiện hành',
      allOn: 'Bật mọi layer',
      unisolate: 'Bỏ tách riêng',
      thaw: 'Rã đông layer',
      unlock: 'Mở khóa layer',
      restore: 'Khôi phục layer'
    },
    arc: {
      threePoint: '3 điểm',
      startCenterEnd: 'Đầu, tâm, cuối',
      startCenterAngle: 'Đầu, tâm, góc',
      startCenterLength: 'Đầu, tâm, chiều dài',
      startEndAngle: 'Đầu, cuối, góc',
      startEndDirection: 'Đầu, cuối, hướng',
      startEndRadius: 'Đầu, cuối, bán kính',
      centerStartEnd: 'Tâm, đầu, cuối',
      centerStartAngle: 'Tâm, đầu, góc',
      centerStartLength: 'Tâm, đầu, chiều dài'
    },
    circle: {
      centerRadius: 'Tâm, bán kính',
      centerDiameter: 'Tâm, đường kính',
      twoPoint: '2 điểm',
      threePoint: '3 điểm',
      tanTanRadius: 'Tiếp, tiếp, bán kính',
      tanTanTan: 'Tiếp, tiếp, tiếp'
    },
    ellipse: {
      ellipse: 'Elip',
      arc: 'Cung elip'
    },
    tooltip: {
      line: 'Vẽ một đoạn thẳng.',
      polyline:
        'Vẽ chuỗi đoạn thẳng hoặc cung nối liền nhau thành một đối tượng.',
      spline:
        'Vẽ đường cong spline trơn qua các điểm khớp hoặc điểm điều khiển.',
      sketch: 'Vẽ chuỗi đoạn thẳng bằng tay.',
      revcloud: 'Vẽ đám mây đánh dấu vùng cần rà soát.',
      circle: 'Vẽ đường tròn theo nhiều cách dựng khác nhau.',
      arc: 'Vẽ cung tròn theo nhiều cách dựng khác nhau.',
      mline: 'Vẽ nhiều đường song song thành một đối tượng multiline.',
      ray: 'Vẽ tia dựng hình xuất phát từ một điểm.',
      xline: 'Vẽ đường dựng hình dài vô hạn.',
      ellipse: 'Vẽ elip hoặc cung elip.',
      rect: 'Vẽ hình chữ nhật hoặc đa giác đều.',
      point: 'Đặt một điểm vào bản vẽ.',
      hatch: 'Tô một vùng kín bằng mẫu hatch.',
      text: 'Tạo đoạn chữ nhiều dòng trong bản vẽ.',
      dimension: 'Ghi kích thước bằng nhiều phương pháp.',
      dimlinear: 'Ghi kích thước ngang, đứng hoặc xoay.',
      dimaligned: 'Ghi kích thước theo phương nghiêng.',
      dimradius: 'Ghi bán kính đường tròn hoặc cung tròn.',
      dimdiameter: 'Ghi đường kính đường tròn hoặc cung tròn.',
      dimangular: 'Ghi kích thước góc.',
      dimarc: 'Ghi chiều dài cung tròn.',
      dimordinate: 'Ghi kích thước tọa độ.',
      dimcontinue: 'Ghi kích thước nối tiếp kích thước trước.',
      dimbaseline: 'Ghi kích thước từ đường cơ sở trước.',
      dimstyle: 'Mở quản lý kiểu kích thước.',
      move: 'Di chuyển các đối tượng đang chọn sang vị trí mới.',
      rotate: 'Xoay các đối tượng đang chọn quanh một điểm chuẩn.',
      copy: 'Sao chép các đối tượng đang chọn sang vị trí mới.',
      erase: 'Xóa các đối tượng đang chọn khỏi bản vẽ.',
      offset: 'Tạo bản sao song song cách đối tượng một khoảng cho trước.',
      undo: 'Hoàn tác thao tác chỉnh sửa vừa rồi.',
      redo: 'Làm lại thao tác vừa hoàn tác.',
      properties: 'Mở bảng Thuộc tính cho phần đang chọn.',
      quickSelect: 'Mở Chọn nhanh để lọc và chọn đối tượng theo tiêu chí.',
      find: 'Mở bảng tìm chữ trong toàn bộ bản vẽ hoặc layout hiện tại.',
      countList: 'Mở bảng Đếm để xem và quản lý số lượng block.',
      missingResources:
        'Mở bảng Tài nguyên thiếu / tham chiếu ngoài cho phông, ảnh và xref.',
      drawingUnits:
        'Mở Đơn vị bản vẽ để đặt định dạng tọa độ, số chữ số và tỉ lệ chèn.',
      attachDwg: 'Gắn một bản vẽ DWG hoặc DXF làm tham chiếu ngoài (XATTACH).',
      attachImage: 'Gắn một ảnh raster làm tham chiếu ngoài (IMAGEATTACH).',
      insert: 'Mở bảng Block để duyệt và chèn định nghĩa block (INSERT).',
      editAttributes:
        'Mở trình sửa thuộc tính block để đổi giá trị và cách hiển thị (ATTEDIT).',
      defineAttribute:
        'Tạo một định nghĩa thuộc tính để dùng trong block (ATTDEF).',
      agent: 'Mở thẻ CAD Agent để vẽ hình bằng câu lệnh ngôn ngữ tự nhiên.',
      propertyColor: 'Đặt màu cho đối tượng mới tạo hoặc đối tượng đang chọn.',
      propertyLineType:
        'Đặt kiểu nét cho đối tượng mới tạo hoặc đối tượng đang chọn.',
      propertyLineWeight:
        'Đặt bề dày nét cho đối tượng mới tạo hoặc đối tượng đang chọn.',
      layerAction: {
        off: 'Tắt layer đang chọn để ẩn các đối tượng trên đó mà không đóng băng layer.',
        isolate:
          'Chỉ hiện layer đang chọn và ẩn các layer còn lại để tập trung vào nhóm đối tượng liên quan.',
        freeze:
          'Đóng băng layer đang chọn: các đối tượng bị ẩn và được bỏ qua khi tái tạo hình.',
        lock: 'Khóa layer đang chọn: đối tượng vẫn hiện nhưng không sửa được.',
        current:
          'Đặt layer đang chọn làm hiện hành để đối tượng mới nằm trên layer đó.',
        allOn:
          'Bật lại mọi layer đang tắt. Layer đang đóng băng vẫn giữ nguyên.',
        unisolate:
          'Khôi phục các layer đã bị ẩn hoặc khóa bởi lệnh Tách riêng, giữ lại các thay đổi sau đó.',
        thaw: 'Rã đông layer đang chọn để đối tượng hiện lại và được tính khi tái tạo hình.',
        unlock:
          'Mở khóa layer đang chọn để chọn và sửa được đối tượng trên đó.',
        restore:
          'Khôi phục trạng thái layer trước thao tác layer gần nhất trên ribbon này.'
      },
      circleOption: {
        centerRadius: 'Dựng đường tròn từ một điểm tâm và bán kính.',
        centerDiameter: 'Dựng đường tròn từ một điểm tâm và đường kính.',
        twoPoint: 'Dựng đường tròn có đường kính xác định bởi hai điểm.',
        threePoint: 'Dựng đường tròn đi qua ba điểm.',
        tanTanRadius:
          'Dựng đường tròn tiếp xúc hai đối tượng với bán kính cho trước.',
        tanTanTan: 'Dựng đường tròn tiếp xúc ba đối tượng.'
      },
      arcOption: {
        threePoint: 'Dựng cung đi qua điểm đầu, một điểm giữa và điểm cuối.',
        startCenterEnd: 'Dựng cung từ điểm đầu, điểm tâm và điểm cuối.',
        startCenterAngle: 'Dựng cung từ điểm đầu, điểm tâm và góc ở tâm.',
        startCenterLength: 'Dựng cung từ điểm đầu, điểm tâm và chiều dài cung.',
        startEndAngle: 'Dựng cung từ điểm đầu, điểm cuối và góc ở tâm.',
        startEndDirection:
          'Dựng cung từ điểm đầu, điểm cuối và hướng tiếp tuyến tại điểm đầu.',
        startEndRadius:
          'Dựng cung từ điểm đầu, điểm cuối và bán kính cho trước.',
        centerStartEnd: 'Dựng cung từ điểm tâm, điểm đầu và điểm cuối.',
        centerStartAngle: 'Dựng cung từ điểm tâm, điểm đầu và góc ở tâm.',
        centerStartLength: 'Dựng cung từ điểm tâm, điểm đầu và chiều dài cung.'
      },
      rectOption: {
        rectangle:
          'Dựng hình chữ nhật bằng hai góc đối diện hoặc bằng kích thước.',
        polygon: 'Dựng đa giác đều bằng số cạnh và cách dựng.'
      },
      ellipseOption: {
        ellipse: 'Dựng elip đầy đủ bằng trục lớn và trục nhỏ.',
        arc: 'Dựng cung elip bằng các trục elip và giới hạn cung.'
      }
    },
    command: {
      line: 'Đường thẳng',
      polyline: 'Đa tuyến',
      circle: 'Đường tròn',
      arc: 'Cung tròn',
      mline: 'MLine',
      ray: 'Tia',
      xline: 'XLine',
      ellipse: 'Elip',
      spline: 'Spline',
      sketch: 'Vẽ tay',
      revcloud: 'Mây rà soát',
      rect: 'Chữ nhật',
      rectangle: 'Chữ nhật',
      polygon: 'Đa giác',
      point: 'Điểm',
      divide: 'Chia đều',
      hatch: 'Hatch',
      text: 'Chữ',
      gradient: 'Chuyển sắc',
      dimension: 'Kích thước',
      dimlinear: 'Thẳng',
      dimaligned: 'Nghiêng',
      dimradius: 'Bán kính',
      dimdiameter: 'Đường kính',
      dimangular: 'Góc',
      dimarc: 'Dài\ncung',
      dimordinate: 'Tọa độ',
      dimcontinue: 'Nối tiếp',
      dimbaseline: 'Đường cơ sở',
      dimstyle: 'Kiểu kích thước',
      move: 'Di chuyển',
      rotate: 'Xoay',
      copy: 'Sao chép',
      erase: 'Xóa',
      offset: 'Offset',
      undo: 'Hoàn tác',
      redo: 'Làm lại',
      properties: 'Thuộc tính',
      quickSelect: 'Chọn\nnhanh',
      find: 'Tìm kiếm',
      countList: 'Đếm',
      drawingUnits: 'Đơn vị\nbản vẽ',
      attachDwg: 'Gắn\nDWG',
      attachImage: 'Gắn\nảnh',
      insert: 'Chèn',
      editAttributes: 'Sửa\nthuộc tính',
      defineAttribute: 'Định nghĩa\nthuộc tính',
      agent: 'CAD\nAgent'
    }
  },
  verticalToolbar: {
    measure: {
      text: 'Đo',
      description: 'Các công cụ đo đạc'
    },
    measureDistance: {
      text: 'Khoảng cách',
      description: 'Đo khoảng cách giữa hai điểm'
    },
    measureContinuous: {
      text: 'Liên tục',
      description:
        'Đo chuỗi khoảng cách qua các điểm liên tiếp đến khi nhấn Enter hoặc Hủy'
    },
    measureAngle: {
      text: 'Góc',
      description: 'Đo góc giữa hai đường có chung đỉnh'
    },
    measureArea: {
      text: 'Diện tích',
      description: 'Đo diện tích một đa giác'
    },
    measureArc: {
      text: 'Cung',
      description: 'Đo chiều dài cung xác định bởi ba điểm'
    },
    measurePoint: {
      text: 'Điểm',
      description: 'Đo tọa độ X/Y của điểm được chọn'
    },
    measurementPanel: {
      text: 'Bảng kết quả',
      description: 'Mở bảng kết quả đo'
    },
    clearMeasurements: {
      text: 'Xóa',
      description: 'Gỡ mọi kết quả đo khỏi màn hình'
    },
    measurementImport: {
      text: 'Nhập',
      description: 'Nhập kết quả đo từ tệp JSON đi kèm'
    },
    measurementExport: {
      text: 'Xuất',
      description: 'Xuất kết quả đo ra tệp JSON đi kèm'
    },
    annotation: {
      text: 'Ghi chú',
      description:
        'Tạo ghi chú bằng chữ hoặc hình để giải thích và đánh dấu bản vẽ'
    },
    layer: {
      text: 'Layer',
      description: 'Quản lý layer'
    },
    pan: {
      text: 'Di chuyển màn hình',
      description: 'Dời khung nhìn mà không đổi hướng nhìn hay độ phóng'
    },
    markupPanel: {
      text: 'Bảng kết quả',
      description: 'Mở bảng ghi chú rà soát'
    },
    markupText: {
      text: 'Chữ',
      description: 'Đặt ghi chú bằng chữ'
    },
    markupCloud: {
      text: 'Đám mây',
      description: 'Vẽ đám mây ghi chú'
    },
    markupRect: {
      text: 'Hình chữ nhật',
      description: 'Vẽ hình chữ nhật ghi chú'
    },
    markupCircle: {
      text: 'Đường tròn',
      description: 'Vẽ đường tròn ghi chú'
    },
    markupArrow: {
      text: 'Mũi tên',
      description: 'Vẽ mũi tên ghi chú'
    },
    markupLine: {
      text: 'Đoạn thẳng',
      description: 'Vẽ đoạn thẳng ghi chú'
    },
    markupCallout: {
      text: 'Chú dẫn',
      description: 'Vẽ chú dẫn'
    },
    markupStamp: {
      text: 'Dấu xác nhận',
      description: 'Đặt dấu xác nhận'
    },
    markupImport: {
      text: 'Nhập',
      description: 'Nhập ghi chú từ tệp JSON đi kèm'
    },
    markupExport: {
      text: 'Xuất',
      description: 'Xuất ghi chú ra tệp JSON đi kèm'
    },
    markupColor: {
      text: 'Màu',
      description: 'Đặt màu cho ghi chú mới'
    },
    markupFontSize: {
      text: 'Chiều cao chữ',
      description: 'Đặt chiều cao chữ ghi chú theo màn hình hoặc đơn vị bản vẽ',
      fit: 'Vừa màn hình',
      wcs: 'Hệ tọa độ'
    },
    measurementColor: {
      text: 'Màu',
      description: 'Đặt màu cho kết quả đo đã chọn hoặc các phép đo tiếp theo'
    },
    measurementFontSize: {
      text: 'Chiều cao chữ',
      description:
        'Đặt chiều cao chữ cho kết quả đo đã chọn hoặc phép đo tiếp theo',
      fit: 'Vừa màn hình',
      wcs: 'Hệ tọa độ'
    },
    showMarkup: {
      text: 'Hiện',
      description: 'Hiện ghi chú'
    },
    hideMarkup: {
      text: 'Ẩn',
      description: 'Ẩn ghi chú'
    },
    showMeasurements: {
      text: 'Hiện',
      description: 'Hiện kết quả đo'
    },
    hideMeasurements: {
      text: 'Ẩn',
      description: 'Ẩn kết quả đo'
    },
    clearMarkups: {
      text: 'Xóa',
      description: 'Xóa toàn bộ ghi chú trên layout hiện tại'
    },
    select: {
      text: 'Chọn',
      description: 'Chọn đối tượng'
    },
    switchBg: {
      text: 'Đổi nền',
      description: 'Đổi nền bản vẽ giữa trắng và đen',
      disabledInReadingMode:
        'Không dùng khi bật chế độ đọc với nền trắng cố định'
    },
    readingMode: {
      text: 'Chế độ đọc',
      description:
        'Bật hoặc tắt chế độ đọc: nét đen trên nền trắng để dễ rà soát'
    },
    zoom: {
      text: 'Thu phóng',
      description:
        'Thu phóng theo khung nhìn đã lưu, toàn bản vẽ, vùng chính hoặc cửa sổ'
    },
    zoomSaved: {
      text: 'Đã lưu',
      description: 'Khôi phục khung nhìn AutoCAD đã lưu hoặc khung nhìn lúc mở'
    },
    zoomToExtent: {
      text: 'Thu toàn bản vẽ',
      description: 'Phóng khung nhìn để thấy toàn bộ đối tượng'
    },
    zoomSmartExtents: {
      text: 'Vùng chính',
      description: 'Phóng vừa cụm hình học chính, bỏ qua đối tượng nằm quá xa'
    },
    zoomToBox: {
      text: 'Phóng theo khung',
      description: 'Phóng vào vùng xác định bởi một khung chữ nhật'
    }
  },
  statusBar: {
    setting: {
      tooltip: 'Thiết lập hiển thị',
      commandLine: 'Dòng lệnh',
      coordinate: 'Tọa độ',
      entityInfo: 'Thông tin đối tượng',
      languageSelector: 'Chọn ngôn ngữ',
      ribbon: 'Thanh công cụ',
      toolbar: 'Thanh công cụ',
      stats: 'Thống kê'
    },
    cannoscale: {
      tooltip: 'Tỷ lệ chú thích (CANNOSCALE)'
    },
    annoallvisible: {
      on: 'Ẩn đối tượng chú thích không hỗ trợ tỷ lệ hiện tại',
      off: 'Hiện toàn bộ đối tượng chú thích (ANNOALLVISIBLE)'
    },
    osnap: {
      tooltip: 'Truy bắt điểm',
      endpoint: 'Điểm cuối',
      midpoint: 'Trung điểm',
      center: 'Tâm',
      node: 'Điểm nút',
      quadrant: 'Điểm phần tư',
      intersection: 'Giao điểm',
      insertion: 'Điểm chèn',
      nearest: 'Điểm gần nhất'
    },
    pointStyle: {
      tooltip: 'Đổi kiểu hiển thị điểm'
    },
    fullScreen: {
      on: 'Thoát toàn màn hình',
      off: 'Xem toàn màn hình'
    },
    dynamicInput: {
      on: 'Tắt nhập động',
      off: 'Bật nhập động'
    },
    lineWidth: {
      on: 'Ẩn bề dày nét',
      off: 'Hiện bề dày nét'
    },
    orthoMode: {
      on: 'Tắt chế độ vuông góc',
      off: 'Bật chế độ vuông góc'
    },
    polarTracking: {
      on: 'Tắt dò góc cực',
      off: 'Bật dò góc cực'
    },
    theme: {
      dark: 'Chuyển sang giao diện sáng',
      light: 'Chuyển sang giao diện tối'
    },
    warning: {
      font: 'Không tìm thấy những phông sau'
    },
    notification: {
      tooltip: 'Xem thông báo'
    },
    export: {
      tooltip: 'Xuất ảnh dạng PNG'
    },
    moreLayouts: 'Thêm layout'
  },
  toolPalette: {
    entityProperties: {
      tab: 'Thuộc tính',
      title: 'Thuộc tính đối tượng',
      propertyPanel: {
        noEntitySelected: 'Chưa chọn đối tượng nào',
        multipleEntitySelected: 'Đang chọn {count} đối tượng',
        propValCopied: 'Đã chép giá trị thuộc tính',
        failedToCopyPropVal: 'Không chép được giá trị thuộc tính'
      }
    },
    layerManager: {
      tab: 'Layer',
      title: 'Quản lý layer',
      currentLayerLabel: 'Layer hiện hành: {name}',
      searchPlaceholder: 'Tìm layer',
      filters: 'Bộ lọc',
      collapseFilters: 'Thu gọn bộ lọc',
      expandFilters: 'Mở rộng bộ lọc',
      filterAll: 'Tất cả',
      filterAllUsed: 'Mọi layer đang dùng',
      toolbar: {
        showFilters: 'Bộ lọc layer',
        newFilter: 'Bộ lọc mới',
        newFilterGroup: 'Nhóm lọc mới',
        newLayer: 'Layer mới',
        deleteLayer: 'Xóa layer',
        setCurrent: 'Đặt hiện hành'
      },
      prompts: {
        newFilterTitle: 'Bộ lọc mới',
        newFilterName: 'Nhập tên bộ lọc',
        newFilterGroupTitle: 'Nhóm lọc mới',
        newFilterGroupName: 'Nhập tên nhóm lọc',
        newLayerTitle: 'Layer mới',
        newLayerName: 'Nhập tên layer',
        confirm: 'Đồng ý',
        cancel: 'Hủy'
      },
      messages: {
        filterCreated: 'Đã tạo bộ lọc "{name}"',
        filterExists: 'Đã có bộ lọc tên "{name}"',
        filterCreateFailed: 'Không tạo được bộ lọc',
        layerCreated: 'Đã tạo layer "{name}"',
        layerExists: 'Layer "{name}" đã tồn tại',
        layerCreateFailed: 'Không tạo được layer',
        layerDeleted: 'Đã xóa layer "{name}"',
        layerDeleteFailed: 'Không xóa được layer "{name}"',
        cannotDeleteLayer0: 'Không thể xóa layer "0"',
        cannotDeleteCurrent: 'Không thể xóa layer hiện hành',
        selectLayerFirst: 'Hãy chọn một layer trước',
        setCurrentSuccess: 'Đã đặt layer hiện hành là "{name}"',
        setCurrentFailed: 'Không đặt được layer hiện hành'
      },
      layerList: {
        name: 'Tên',
        on: 'Bật',
        freeze: 'Đóng băng',
        lock: 'Khóa',
        plot: 'In',
        color: 'Màu',
        linetype: 'Kiểu nét',
        lineweight: 'Bề dày nét',
        transparency: 'Độ trong suốt',
        description: 'Mô tả',
        currentLayer: 'Layer hiện hành',
        newLayerPlaceholder: 'Tên layer',
        zoomToLayer: 'Đã phóng tới layer "{layer}"',
        lineWeightDefault: 'Mặc định'
      }
    },
    find: {
      tab: 'Tìm kiếm',
      title: 'Tìm kiếm',
      placeholder: 'Tìm chữ',
      input: 'Nội dung cần tìm',
      find: 'Tìm kiếm',
      matchCase: 'Phân biệt chữ hoa, chữ thường',
      currentLayoutOnly: 'Chỉ layout hiện tại',
      hint: 'Nhấn Enter để tìm chữ, chữ nhiều dòng, thuộc tính và chữ trong block, kích thước, chú dẫn, bảng trên mọi layout.',
      hintLayout:
        'Nhấn Enter để tìm chữ, chữ nhiều dòng, thuộc tính và chữ trong block, kích thước, chú dẫn, bảng của layout hiện tại.',
      noResults: 'Không tìm thấy chữ',
      count: 'Tìm thấy {count} kết quả',
      countLayouts: 'Tìm thấy {count} kết quả trong {layouts} layout',
      countTruncated: 'Hiện {count} kết quả đầu tiên — hãy thu hẹp tìm kiếm',
      noDocument: 'Mở bản vẽ để tìm kiếm',
      layoutUnavailable: 'Không mở được layout "{layout}"',
      unnamedLayout: '(layout chưa có tên)',
      kind: {
        text: 'Chữ',
        mtext: 'Chữ nhiều dòng',
        attribute: 'Thuộc tính',
        block: 'Chữ trong block',
        dimension: 'Kích thước',
        leader: 'Chú dẫn',
        table: 'Bảng'
      }
    },
    countList: {
      tab: 'Đếm',
      title: 'Đếm',
      searchPlaceholder: 'Tìm tên block',
      countInArea: 'Đếm trong vùng',
      areaSet: 'Đã cập nhật vùng đếm',
      areaCleared: 'Đang đếm toàn bộ không gian mô hình',
      blockName: 'Block',
      count: 'Số lượng',
      empty: 'Không tìm thấy block nào đang hiện',
      prompt: {
        firstCorner: 'Chọn góc thứ nhất của vùng đếm hoặc [Toàn bộ]: ',
        secondCorner: 'Chọn góc đối diện: '
      }
    },
    designReview: {
      tab: 'Rà soát',
      title: 'Rà soát',
      searchPlaceholder: 'Tìm ghi chú',
      empty: 'Chưa có ghi chú',
      type: 'Loại',
      status: 'Trạng thái',
      author: 'Người tạo',
      summary: 'Tóm tắt',
      details: 'Chi tiết',
      closeDetails: 'Đóng chi tiết',
      label: 'Nhãn',
      comment: 'Nhận xét',
      zoomTo: 'Phóng tới',
      delete: 'Xóa',
      clear: 'Xóa tất cả',
      statusValues: {
        open: 'Chưa xử lý',
        question: 'Câu hỏi',
        answered: 'Đã trả lời',
        closed: 'Đã đóng'
      }
    },
    measurements: {
      tab: 'Đo',
      title: 'Kết quả đo',
      empty: 'Chưa có kết quả đo',
      type: 'Loại',
      value: 'Giá trị',
      filterAll: 'Tất cả',
      delete: 'Xóa',
      clear: 'Xóa tất cả',
      typeValues: {
        distance: 'Khoảng cách',
        angle: 'Góc',
        area: 'Diện tích',
        arc: 'Cung tròn',
        point: 'Tọa độ XY'
      }
    },
    missingResources: {
      tab: 'Tài nguyên',
      title: 'Tài nguyên thiếu / tham chiếu ngoài',
      fontTab: 'Phông',
      imageTab: 'Ảnh',
      xrefTab: 'Tham chiếu ngoài',
      attach: 'Gắn',
      attachDwg: 'Gắn DWG/DXF...',
      attachImage: 'Gắn ảnh...',
      attachImageFailed: 'Không gắn được ảnh "{name}"',
      fileReferences: 'Tệp tham chiếu',
      details: 'Chi tiết',
      foundAt: 'Tìm thấy tại',
      selectReference: 'Chọn một tham chiếu để xem chi tiết',
      expandDetails: 'Mở rộng chi tiết',
      collapseDetails: 'Thu gọn chi tiết',
      apply: 'Áp dụng',
      applyDone: 'Đã áp dụng thay thế',
      emptyFonts: 'Không thiếu phông nào',
      emptyImages: 'Không thiếu ảnh nào',
      matchFontType: 'Khớp loại phông (SHX / lưới)',
      missedFont: 'Phông thiếu',
      replacedFont: 'Phông thay thế',
      selectFont: 'Chọn phông để thay thế',
      selectLocalFont: 'Chọn tệp phông trên máy',
      file: 'Tệp',
      replace: 'Thay thế',
      name: 'Tên',
      path: 'Đường dẫn đã lưu',
      type: 'Loại',
      typeAttach: 'Gắn kèm',
      typeOverlay: 'Chồng lớp',
      typeImage: 'Ảnh',
      status: 'Trạng thái',
      statusMissing: 'Thiếu',
      statusLoaded: 'Đã tải',
      actions: 'Thao tác',
      visible: 'Đang hiện',
      browse: 'Duyệt…',
      fromUrl: 'Từ URL…',
      unload: 'Gỡ tải',
      load: 'Tải',
      empty: 'Bản vẽ này không có tham chiếu ngoài hay ảnh nào',
      urlPrompt: 'Nhập URL tới tệp DWG hoặc DXF',
      urlRequired: 'Hãy nhập URL',
      loadFailed: 'Không tải được tham chiếu "{name}"'
    },
    memoryProfile: {
      tab: 'Bộ nhớ',
      title: 'Hồ sơ bộ nhớ',
      refresh: 'Làm mới',
      collecting: 'Đang phân tích bộ nhớ ...',
      showPie: 'Hiện biểu đồ tổng hợp',
      hidePie: 'Ẩn biểu đồ tổng hợp',
      collectedAt: 'Thu thập lúc {time}',
      heapUsed: 'Vùng nhớ JS {used} / {total}',
      estimateNote:
        'Kích thước hình học lấy từ byteLength của buffer. Các nhóm còn lại là ước lượng.',
      estimated: 'ước lượng',
      pieTotal: 'Đã tính',
      pieAriaLabel: 'Phân bổ bộ nhớ theo nhóm',
      empty: 'Không có dữ liệu',
      missedFonts: 'Phông thiếu',
      fontMemory: 'Bộ nhớ phông / mtext',
      fontMemorySummary:
        'Bộ nhớ {live} (luồng chính {main} · worker {workers})',
      fontStorage: 'Lưu trữ IndexedDB (không phải bộ nhớ)',
      fontStorageSummary: '{count} phông đã lưu · {size}',
      materialPoint: 'Điểm',
      materialLine: 'Đường',
      materialFill: 'Vùng tô',
      materialTotal: 'Tổng',
      dataModelCounts: '{entities} đối tượng · {objects} object · {total}',
      dataModelCategories: 'Theo nhóm',
      dataModelEntityTypes: 'Theo loại đối tượng',
      categories: {
        heap: 'Vùng nhớ JS',
        geometry: 'Hình học',
        mapping: 'Ánh xạ',
        spatial: 'Chỉ mục không gian',
        dataModel: 'Mô hình dữ liệu',
        materials: 'Vật liệu hiển thị',
        fonts: 'Phông'
      },
      tabs: {
        geometry: 'Hình học',
        spatial: 'Không gian',
        dataModel: 'Mô hình dữ liệu',
        materials: 'Vật liệu hiển thị',
        fonts: 'Phông'
      },
      columns: {
        layout: 'Layout',
        layer: 'Layer',
        geometry: 'Hình học',
        mapping: 'Ánh xạ',
        entities: 'Đối tượng',
        rootItems: 'Gốc',
        childItems: 'Con',
        estimated: 'Cỡ ước lượng',
        type: 'Loại',
        count: 'Số lượng',
        category: 'Nhóm',
        font: 'Phông'
      }
    },
    openFileProfile: {
      tab: 'Hiệu năng mở',
      title: 'Hiệu năng mở bản vẽ',
      refresh: 'Làm mới',
      copy: 'Chép',
      copied: 'Đã chép dữ liệu hiệu năng',
      copyFailed: 'Không chép được dữ liệu hiệu năng',
      collectedAt: 'Thu thập lúc {time}',
      hint: 'Tự động ghi lại ở lần mở bản vẽ gần nhất. Đặt OPENPROF=1 để ghi thêm ra console.',
      noData: 'Chưa có dữ liệu. Hãy mở một bản vẽ rồi chạy lệnh OPENPERF.',
      empty: 'Không có dữ liệu',
      timing: 'Thời gian thực tế',
      progressive: 'Mở lũy tiến',
      progressiveMode: 'Chế độ',
      progressiveOn: 'Bật',
      progressiveOff: 'Tắt',
      midOpenPaints: 'Số lần vẽ giữa chừng',
      yields: 'Số lần nhường luồng',
      cache: 'Bộ nhớ đệm dựng hình INSERT (cấp trên cùng)',
      slowBlocks: 'Các block trượt đệm chậm nhất',
      total: 'Tổng thời gian mở',
      read: 'db.read',
      parse: 'PARSE',
      entity: 'Đẩy ENTITY',
      convert: 'Dựng cảnh',
      cacheHits: 'Lượt trúng đệm',
      cacheMisses: 'Lượt trượt đệm',
      cacheBuild: 'Dựng khi trượt',
      cacheCompact: 'Gộp khi trượt',
      cacheHitPath: 'Nhánh trúng đệm',
      columns: {
        stage: 'Giai đoạn',
        duration: 'Thời lượng',
        share: 'Tỉ trọng',
        metric: 'Chỉ số',
        value: 'Giá trị',
        block: 'Block',
        build: 'Dựng',
        compact: 'Gộp'
      }
    },
    blocks: {
      tab: 'Block',
      title: 'Block',
      tabCurrentDrawing: 'Bản vẽ hiện tại',
      tabRecent: 'Gần đây',
      tabFavorites: 'Ưa dùng',
      tabLibraries: 'Thư viện',
      sectionCurrentDrawing: 'Block trong bản vẽ hiện tại',
      sectionRecent: 'Block dùng gần đây',
      sectionFavorites: 'Block ưa dùng',
      sectionLibraries: 'Thư viện block',
      filterPlaceholder: 'Lọc...',
      empty: 'Không có block nào',
      emptyRecent: 'Chưa chèn block nào gần đây',
      emptyFavorites: 'Chưa có block ưa dùng',
      emptyLibraries: 'Chưa cấu hình thư viện nào',
      toggleFavorite: 'Bật/tắt ưa dùng',
      options: 'Tùy chọn',
      insertionPoint: 'Điểm chèn',
      scale: 'Tỉ lệ',
      rotation: 'Góc xoay',
      angle: 'Góc',
      autoPlacement: 'Tự đặt vị trí',
      repeatPlacement: 'Đặt lặp lại',
      explode: 'Phá khối'
    }
  },
  colorDropdown: {
    custom: 'Tùy chọn'
  },
  lineTypeSelect: {
    placeholder: 'Kiểu nét'
  },
  colorIndexPicker: {
    color: 'Màu: ',
    colorIndex: 'Chỉ số màu: ',
    inputPlaceholder: '0-256, BYLAYER, BYBLOCK',
    rgb: 'RGB: '
  },
  entityInfo: {
    color: 'Màu',
    layer: 'Layer',
    lineType: 'Kiểu nét'
  },
  ribbonProperty: {
    color: 'Màu',
    lineType: 'Kiểu nét',
    lineWeight: 'Bề dày nét',
    layer: 'Layer'
  },
  layerSelect: {
    searchPlaceholder: 'Tìm tên layer',
    noLayerAvailable: 'Không có layer nào',
    noMatchedLayer: 'Không có layer nào khớp',
    tooltip: {
      layer: 'Layer',
      visibility: 'Hiển thị',
      freeze: 'Đóng băng',
      lock: 'Khóa',
      lineType: 'Kiểu nét',
      color: 'Màu',
      visible: 'Đang hiện',
      hidden: 'Đang ẩn',
      frozen: 'Đang đóng băng',
      thawed: 'Đã rã đông',
      locked: 'Đang khóa',
      unlocked: 'Đã mở khóa'
    }
  },
  message: {
    loadingFonts: 'Đang tải phông ...',
    loadingDwgConverter: 'Đang tải bộ chuyển đổi DWG...',
    fontsNotFound: 'Không tìm thấy phông {fonts} trong kho phông.',
    fontsNotLoaded: 'Không tải được phông {fonts}.',
    fontMissedInDrawing:
      'Phông "{font}" được {count} đối tượng chữ sử dụng nhưng không có sẵn. Đang hiển thị bằng "{replacementFont}".',
    fontMissedReplacement: '"{font}" (đang hiển thị bằng "{replacement}")',
    fontCached: 'Đã lưu phông "{font}" vào bộ đệm.',
    fontCacheFailed: 'Không lưu được phông "{fileName}" vào bộ đệm.',
    failedToGetAvaiableFonts: 'Không lấy được danh sách phông từ "{url}".',
    failedToOpenFile: 'Không mở được tệp "{fileName}".',
    failedToOpenFileToast:
      'Không mở được "{fileName}". Xem chi tiết trong bảng thông báo.',
    failedToOpenFileWorkerOom:
      'Không mở được "{fileName}". Bản vẽ quá lớn so với bộ nhớ hiện có.',
    failedToOpenFileWorkerOomLink: 'trang này',
    failedToOpenFileWorkerTimeout:
      'Không mở được "{fileName}". Quá thời gian khi phân tích bản vẽ.',
    failedToOpenFileFontLoadFailed:
      'Không mở được "{fileName}". Không tải được các phông cần thiết.',
    failedToOpenFileLicenseExpired:
      'Không mở được "{fileName}". Giấy phép bộ chuyển đổi DWG đã hết hạn.',
    failedToOpenFileLicenseInvalid:
      'Không mở được "{fileName}". Giấy phép bộ chuyển đổi DWG bị thiếu hoặc không hợp lệ.',
    fetchingDrawingFile: 'Đang tải tệp ...',
    unknownEntities:
      'Bản vẽ này chứa {count} đối tượng lạ hoặc chưa hỗ trợ. Những đối tượng đó sẽ không được hiển thị.',
    tianzhengEntities:
      'Bản vẽ có khoảng {count} đối tượng riêng của TArch / Tianzheng hoặc phần mềm tương tự. Môi trường hiện tại chưa đọc được đầy đủ nên một số nội dung có thể không hiện.',
    emptyProxyEntities:
      'Bản vẽ có {count} đối tượng riêng không kèm hình học thay thế. Các đối tượng này sẽ không hiện.'
  },
  notification: {
    center: {
      title: 'Thông báo',
      clearAll: 'Xóa hết',
      noNotifications: 'Không có thông báo'
    },
    group: {
      fontMissed: 'Thiếu phông chữ',
      fontMissedSummary:
        'Có {count} thông báo về phông chữ. Nhấn để xem chi tiết.',
      unsupportedEntities: 'Đối tượng chưa hỗ trợ',
      unsupportedEntitiesSummary:
        'Có {count} thông báo khi đọc bản vẽ. Nhấn để xem chi tiết.',
      genericSummary: 'Có {count} thông báo. Nhấn để xem chi tiết.'
    },
    time: {
      justNow: 'Vừa xong',
      minutesAgo: '{count} phút trước | {count} phút trước',
      hoursAgo: '{count} giờ trước | {count} giờ trước',
      daysAgo: '{count} ngày trước | {count} ngày trước'
    },
    title: {
      failedToOpenFile: 'Không mở được tệp',
      failedToOpenFileWorkerOom: 'Bản vẽ quá lớn',
      failedToOpenFileWorkerTimeout: 'Quá thời gian mở',
      failedToOpenFileFontLoadFailed: 'Không tải được phông',
      failedToOpenFileLicenseExpired: 'Giấy phép hết hạn',
      failedToOpenFileLicenseInvalid: 'Giấy phép không hợp lệ',
      fontNotFound: 'Không tìm thấy phông',
      fontNotLoaded: 'Không tải được phông',
      parsingWarning: 'Có vấn đề khi phân tích bản vẽ',
      systemMessage: 'Thông báo hệ thống',
      systemWarning: 'Cảnh báo hệ thống',
      systemError: 'Lỗi hệ thống',
      systemInfo: 'Thông tin hệ thống'
    }
  }
}

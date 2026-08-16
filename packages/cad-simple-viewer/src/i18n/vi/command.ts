export default {
  ACAD: {
    '-hatch': {
      description: 'Tạo mảng tô hatch qua tùy chọn dòng lệnh, không dùng ribbon'
    },
    '-layer': {
      description: 'Quản lý layer qua tùy chọn dòng lệnh'
    },
    about: {
      description: 'Hiện thông tin về mlightcad'
    },
    acadver: {
      description: 'Lưu mã phiên bản của cơ sở dữ liệu bản vẽ (chỉ đọc)'
    },
    angbase: {
      description: 'Đặt hướng góc 0 so với hệ tọa độ người dùng hiện hành'
    },
    angdir: {
      description:
        'Đặt chiều dương của góc là thuận hay ngược chiều kim đồng hồ'
    },
    arc: {
      description: 'Vẽ một cung tròn'
    },
    aunits: {
      description: 'Đặt định dạng hiển thị của góc'
    },
    auprec: {
      description: 'Đặt số chữ số hiển thị của góc, dùng cùng với AUNITS'
    },
    cdxf: {
      description: 'Xuất bản vẽ hiện tại ra DXF'
    },
    cpdf: {
      description: 'Xuất bản vẽ hiện tại ra PDF'
    },
    cecolor: {
      description: 'Đặt màu mặc định cho đối tượng mới tạo'
    },
    celtscale: {
      description: 'Đặt hệ số tỉ lệ kiểu nét cho đối tượng mới tạo'
    },
    celtype: {
      description: 'Đặt kiểu nét cho đối tượng mới tạo'
    },
    celweight: {
      description: 'Đặt bề dày nét mặc định cho đối tượng mới tạo'
    },
    cetransparency: {
      description: 'Đặt độ trong suốt cho đối tượng mới tạo'
    },
    cachefont: {
      description: 'Lưu một tệp phông trên máy vào IndexedDB để dựng chữ'
    },
    circle: {
      description: 'Vẽ một đường tròn theo tâm và bán kính'
    },
    clayer: {
      description:
        'Đặt layer hiện hành cho đối tượng mới và cho thao tác chỉnh sửa'
    },
    cmleaderstyle: {
      description: 'Đặt tên kiểu đường dẫn ghi chú hiện hành'
    },
    cmlscale: {
      description: 'Điều chỉnh bề rộng tổng thể của multiline'
    },
    cmlstyle: {
      description: 'Đặt tên kiểu multiline hiện hành'
    },
    colortheme: {
      description: 'Chọn giao diện màu của ứng dụng (tối hoặc sáng)'
    },
    copy: {
      description: 'Sao chép các đối tượng đang chọn sang vị trí mới',
      prompt: 'Chọn đối tượng'
    },
    csvg: {
      description: 'Chuyển bản vẽ hiện tại sang SVG'
    },
    chtml: {
      description:
        'Xuất bản vẽ hiện tại thành một tệp HTML chạy được ngoại tuyến'
    },
    '-chtml': {
      description: 'Xuất bản vẽ hiện tại ra HTML qua tùy chọn dòng lệnh'
    },
    dimlinear: {
      description: 'Ghi kích thước thẳng'
    },
    dimstyle: {
      description: 'Đặt tên kiểu ghi kích thước hiện hành'
    },
    dwgname: {
      description: 'Lưu tên tệp bản vẽ hiện tại (chỉ đọc)'
    },
    dynmode: {
      description: 'Điều khiển thiết lập nhập động tại con trỏ'
    },
    dynprompt: {
      description: 'Điều khiển việc hiện câu nhắc trong chú giải nhập động'
    },
    ellipse: {
      description: 'Vẽ elip hoặc cung elip theo đầu trục hoặc theo tâm'
    },
    erase: {
      description: 'Xóa các đối tượng đang chọn khỏi bản vẽ',
      prompt: 'Chọn đối tượng'
    },
    extmax: {
      description:
        'Lưu góc trên bên phải phạm vi bản vẽ trong không gian mô hình (chỉ đọc)'
    },
    extmin: {
      description:
        'Lưu góc dưới bên trái phạm vi bản vẽ trong không gian mô hình (chỉ đọc)'
    },
    entout: {
      description: 'Xuất ảnh xem trước đã ghép của các đối tượng đang chọn',
      prompt: 'Chọn đối tượng'
    },
    hideobjects: {
      description: 'Tạm ẩn các đối tượng đang chọn',
      prompt: 'Chọn đối tượng'
    },
    imageattach: {
      description: 'Gắn một ảnh raster làm tham chiếu ngoài vào bản vẽ hiện tại'
    },
    '-insert': {
      description:
        'Chèn một định nghĩa block vào bản vẽ hiện tại (qua dòng lệnh)'
    },
    xattach: {
      description:
        'Gắn một bản vẽ DWG hoặc DXF làm tham chiếu ngoài vào bản vẽ hiện tại'
    },
    gripcolor: {
      description: 'Đặt màu của các grip chưa chọn trên đối tượng đang chọn'
    },
    griphot: {
      description: 'Đặt màu của grip đang được chọn'
    },
    gripobjlimit: {
      description:
        'Ngừng hiện grip khi tập chọn vượt quá số đối tượng cho trước (0 = không giới hạn)'
    },
    grips: {
      description: 'Bật/tắt việc hiện grip trên đối tượng đang chọn'
    },
    gripsize: {
      description: 'Đặt kích thước ô grip tính bằng điểm ảnh'
    },
    hatch: {
      description: 'Tô một vùng kín hoặc các đối tượng đang chọn bằng mẫu hatch'
    },
    ipdf: {
      description: 'Nhập hình vectơ từ một tệp PDF'
    },
    hpang: {
      description: 'Đặt góc mặc định, tính bằng radian, cho mẫu hatch mới tạo'
    },
    hpassoc: {
      description: 'Đặt hatch mới tạo có liên kết với biên hay không'
    },
    hpbackgroundcolor: {
      description: 'Đặt màu nền mặc định cho mẫu hatch mới tạo'
    },
    hpcolor: {
      description: 'Đặt màu mặc định cho hatch mới tạo'
    },
    hpdouble: {
      description: 'Đặt mẫu hatch tự định nghĩa có vẽ chồng hai chiều hay không'
    },
    hpislanddetection: {
      description: 'Cách xử lý các vùng lồng bên trong biên hatch mới tạo'
    },
    hplayer: {
      description: 'Đặt layer mặc định cho hatch và vùng tô mới tạo'
    },
    hpname: {
      description:
        'Đặt tên mẫu mặc định cho hatch mới tạo trong phiên làm việc này'
    },
    hpscale: {
      description: 'Đặt hệ số tỉ lệ mặc định cho mẫu hatch mới tạo'
    },
    hpseparate: {
      description:
        'Đặt việc tạo một hay nhiều đối tượng hatch riêng khi có nhiều biên'
    },
    hptransparency: {
      description: 'Đặt độ trong suốt mặc định cho hatch và vùng tô mới tạo'
    },
    insunits: {
      description:
        'Đặt đơn vị bản vẽ để tự quy đổi tỉ lệ khi chèn block, ảnh hoặc xref'
    },
    laycur: {
      description: 'Chuyển các đối tượng đang chọn sang layer hiện hành',
      prompt: 'Chọn đối tượng cần chuyển sang layer hiện hành'
    },
    laydel: {
      description: 'Xóa một layer và mọi đối tượng nằm trên layer đó'
    },
    layerclose: {
      description: 'Đóng trình quản lý thuộc tính layer'
    },
    layerp: {
      description: 'Hoàn tác thay đổi gần nhất đối với thiết lập layer'
    },
    layfrz: {
      description: 'Đóng băng layer của các đối tượng đang chọn',
      prompt: 'Chọn đối tượng nằm trên layer cần đóng băng'
    },
    layiso: {
      description: 'Tách riêng layer của các đối tượng đang chọn',
      prompt: 'Chọn đối tượng nằm trên layer cần tách riêng'
    },
    laylck: {
      description: 'Khóa layer của các đối tượng đang chọn',
      prompt: 'Chọn đối tượng nằm trên layer cần khóa'
    },
    layoff: {
      description: 'Tắt layer của các đối tượng đang chọn',
      prompt: 'Chọn đối tượng nằm trên layer cần tắt'
    },
    layon: {
      description: 'Bật mọi layer trong bản vẽ'
    },
    laythw: {
      description: 'Rã đông mọi layer đang đóng băng trong bản vẽ'
    },
    layulk: {
      description: 'Mở khóa layer của các đối tượng đang chọn',
      prompt: 'Chọn đối tượng nằm trên layer cần mở khóa'
    },
    layuniso: {
      description: 'Khôi phục các layer đã bị ẩn hoặc khóa bởi lệnh LAYISO'
    },
    line: {
      description: 'Vẽ các đoạn thẳng nối giữa các điểm'
    },
    log: {
      description: 'Ghi thông tin gỡ lỗi ra console'
    },
    ltscale: {
      description: 'Đặt hệ số tỉ lệ kiểu nét chung cho cả bản vẽ'
    },
    lunits: {
      description: 'Đặt định dạng hiển thị của tọa độ và khoảng cách'
    },
    luprec: {
      description: 'Đặt số chữ số hiển thị của đơn vị dài, dùng cùng với LUNITS'
    },
    lwdisplay: {
      description: 'Bật/tắt việc hiện bề dày nét trong bản vẽ'
    },
    clearmeasurements: {
      description: 'Gỡ mọi kết quả đo khỏi màn hình'
    },
    measurearea: {
      description:
        'Tính diện tích và chu vi của đối tượng hoặc các điểm đang chọn'
    },
    measureangle: {
      description: 'Đo góc giữa hai đường hoặc qua ba điểm'
    },
    measurearc: {
      description: 'Đo chiều dài một đoạn cung'
    },
    measuredistance: {
      description: 'Đo khoảng cách và độ chênh tọa độ giữa hai điểm'
    },
    measurepoint: {
      description: 'Đo tọa độ X/Y của điểm được chọn'
    },
    measurement: {
      description: 'Đặt bản vẽ dùng hệ đơn vị Anh hay hệ mét'
    },
    measurementcolor: {
      description: 'Đặt màu dùng cho lớp phủ kết quả đo'
    },
    modelbkcolor: {
      description: 'Đặt màu nền vùng vẽ của không gian mô hình'
    },
    mline: {
      description: 'Vẽ nhiều đường song song thành một đối tượng multiline'
    },
    move: {
      description: 'Di chuyển các đối tượng đang chọn theo một vectơ dời',
      prompt: 'Chọn đối tượng'
    },
    offset: {
      description:
        'Tạo đường cong, đa tuyến hoặc đường tròn song song cách một khoảng cho trước'
    },
    mtext: {
      description: 'Tạo một đối tượng chữ nhiều dòng'
    },
    open: {
      description: 'Mở một tệp bản vẽ có sẵn'
    },
    openprof: {
      description: 'Bật/tắt việc ghi thời gian từng giai đoạn mở tệp ra console'
    },
    openperf: {
      description:
        'Mở bảng Hiệu năng mở bản vẽ với số liệu của lần mở bản vẽ gần nhất'
    },
    orthomode: {
      description:
        'Ràng buộc con trỏ chỉ chạy theo phương ngang hoặc phương đứng'
    },
    osmode: {
      description:
        'Đặt các chế độ truy bắt điểm thường trực bằng giá trị mã bit'
    },
    pan: {
      description: 'Dời khung nhìn mà không đổi hướng nhìn hay độ phóng'
    },
    paperbkcolor: {
      description: 'Đặt màu nền vùng vẽ của không gian in (layout)'
    },
    pdmode: {
      description: 'Điều khiển cách hiển thị đối tượng POINT'
    },
    pdsize: {
      description: 'Đặt cỡ hiển thị của đối tượng POINT'
    },
    pickbox: {
      description: 'Đặt kích thước ô chọn đối tượng, tính bằng điểm ảnh'
    },
    pline: {
      description: 'Vẽ đa tuyến bằng cách chỉ định nhiều điểm'
    },
    pngout: {
      description: 'Xuất ra PNG'
    },
    point: {
      description: 'Tạo các điểm'
    },
    polaraddang: {
      description:
        'Lưu các góc dò cực bổ sung dưới dạng danh sách ngăn bằng dấu chấm phẩy'
    },
    polarang: {
      description: 'Đặt bước góc cho chế độ dò góc cực'
    },
    polarmode: {
      description: 'Điều khiển thiết lập dò góc cực và dò theo điểm truy bắt'
    },
    polygon: {
      description: 'Vẽ đa giác đều theo tâm/bán kính hoặc theo một cạnh'
    },
    qnew: {
      description: 'Bắt đầu một bản vẽ mới'
    },
    ray: {
      description: 'Vẽ một tia xuất phát từ một điểm và kéo dài vô hạn'
    },
    rectang: {
      description: 'Vẽ hình chữ nhật bằng hai góc đối diện'
    },
    regen: {
      description: 'Vẽ lại bản vẽ hiện tại'
    },
    revcloud: {
      description: 'Vẽ đường mây soát xét dạng chữ nhật'
    },
    rotate: {
      description: 'Xoay các đối tượng đang chọn quanh một điểm chuẩn',
      prompt: 'Chọn đối tượng'
    },
    select: {
      description: 'Chọn đối tượng'
    },
    shortcutmenu: {
      description: 'Bật/tắt menu chuột phải trong vùng vẽ'
    },
    sketch: {
      description: 'Vẽ nét phác bằng đa tuyến bám theo chuyển động chuột'
    },
    spline: {
      description:
        'Vẽ đường cong spline trơn bằng cách chỉ định các điểm điều khiển'
    },
    textstyle: {
      description: 'Đặt tên kiểu chữ hiện hành'
    },
    unitmode: {
      description:
        'Điều khiển cách hiện phân số của tọa độ khi LUNITS là kiểu kiến trúc hoặc phân số'
    },
    switchbg: {
      description: 'Đổi nền vùng vẽ giữa trắng và đen'
    },
    unisolateobjects: {
      description: 'Hiện lại mọi đối tượng đã bị ẩn bởi lệnh HIDEOBJECTS'
    },
    undo: {
      description: 'Hoàn tác thao tác chỉnh sửa gần nhất',
      nothingToUndo: 'Không có gì để hoàn tác.'
    },
    redo: {
      description: 'Làm lại thao tác vừa hoàn tác',
      nothingToRedo: 'Không có gì để làm lại.'
    },
    xline: {
      description: 'Vẽ đường dựng hình kéo dài vô hạn về cả hai phía'
    },
    zoom: {
      description: 'Phóng khung nhìn để thấy toàn bộ đối tượng'
    }
  },
  USER: {}
}

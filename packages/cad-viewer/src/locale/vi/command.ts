/**
 * Vietnamese command descriptions.
 *
 * These are what the command line shows when someone types a command name and
 * pauses, so they describe the outcome rather than the mechanism. Command
 * names themselves are never translated — HATCH is HATCH in every AutoCAD
 * installation these engineers have used.
 */
export default {
  ACAD: {
    hatch: {
      description: 'Tạo mảng tô hatch với quy trình theo thẻ ribbon ngữ cảnh'
    },
    layer: {
      description: 'Trình quản lý thuộc tính layer'
    },
    md: {
      description:
        'Mở bảng Tài nguyên thiếu / tham chiếu ngoài cho phông, ảnh và xref'
    },
    xref: {
      description: 'Mở bảng Tài nguyên thiếu / tham chiếu ngoài ở thẻ Xref'
    },
    properties: {
      description: 'Bảng thuộc tính đối tượng'
    },
    countlist: {
      description: 'Mở bảng Đếm để xem và quản lý số lượng block đã đếm'
    },
    mem: {
      description:
        'Mở bảng Hồ sơ bộ nhớ để phân tích mức dùng bộ nhớ của bản vẽ'
    },
    pttype: {
      description: 'Đặt kiểu hiển thị và cỡ của đối tượng điểm'
    },
    qselect: {
      description:
        'Tạo tập chọn bằng cách lọc đối tượng theo loại và theo điều kiện thuộc tính'
    },
    units: {
      description:
        'Đặt định dạng đơn vị dài và góc, số chữ số, chiều đo góc và đơn vị quy đổi khi chèn'
    },
    style: {
      description: 'Tạo, sửa hoặc chọn kiểu chữ cho chữ đơn và chữ nhiều dòng'
    },
    attedit: {
      description: 'Sửa giá trị và cách hiển thị thuộc tính của một block'
    },
    attdef: {
      description: 'Tạo một định nghĩa thuộc tính cho block'
    }
  },
  USER: {}
}

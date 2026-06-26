import type { PlaceRankingItem } from '@/features/place-ranking/types'

// TEMP_NAVER_PLACE_MAINTENANCE:
// 네이버 플레이스 GraphQL captcha 차단이 해제되면 `isPlaceServiceMaintenanceMode`를 false로 바꾸고
// BookingInsightCalendarTool의 라솝뷰티 고정 플로우를 기존 검색 플로우로 되돌린다.
export const isPlaceServiceMaintenanceMode = true
export const serviceMaintenanceMessage = '서비스 점검 중 입니다.'

export const lasopBeautyFixedPlace: PlaceRankingItem = {
  id: '2002192471',
  rank: 1,
  displayRank: 1,
  name: '라솝뷰티',
  category: '속눈썹증모,연장',
  ad: {
    isAd: false,
  },
  location: {
    roadAddress: '노해로 494 고려빌딩 503호',
    address: '상계동 724-3',
    fullAddress: '서울특별시 노원구 노해로 494 고려빌딩 503호',
    commonAddress: '서울 노원구 상계동',
    longitude: 127.0630787,
    latitude: 37.6545572,
  },
  businessHours: {},
  images: {
    mainImageUrl: 'https://ldb-phinf.pstatic.net/20260128_177/1769610369717PuxqX_JPEG/IMG_6702.jpeg',
    imageCount: 38,
    imageUrls: [
      'https://ldb-phinf.pstatic.net/20260128_177/1769610369717PuxqX_JPEG/IMG_6702.jpeg',
      'https://ldb-phinf.pstatic.net/20260305_242/1772716566634e9zwE_JPEG/IMG_7987.jpeg',
      'https://naverbooking-phinf.pstatic.net/20260113_221/1768315864311aTFm3_JPEG/image.jpg',
    ],
  },
  actions: {
    hasBooking: true,
    bookingUrl: 'https://m.booking.naver.com/booking/13/bizes/1418911',
    bookingBusinessId: '1418911',
    talktalkUrl: 'http://talk.naver.com/weuoi7r?frm=pnmb',
    phone: '0507-1395-3933',
    routeUrl:
      'http://map.naver.com/?eText=%EB%9D%BC%EC%86%9D%EB%B7%B0%ED%8B%B0&elng=127.0630787&elat=37.6545572',
  },
  benefits: {
    hasCoupon: true,
    couponCount: 1,
    coupons: [
      {
        title: '5,000원 할인 쿠폰',
        type: 'discount',
        useType: 'BOOKING',
        landingUrl: 'https://m.booking.naver.com/coupon/placeId/2002192471/promotion/799364',
      },
    ],
  },
  options: ['예약', '무선 인터넷', '대기공간', '남/녀 화장실 구분', '간편결제', '주차'],
  reviews: {
    totalReviewCount: 0,
    blogCafeReviewCount: 0,
    bookingReviewCount: 0,
    snippets: [],
    images: [],
  },
  badges: ['예약', '톡톡', '쿠폰'],
  hashtags: [],
  rawText: '라솝뷰티 속눈썹증모,연장 서울 노원구 상계동',
  rankChange: null,
}

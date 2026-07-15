import { Injectable } from "@nestjs/common";

const PIE_CODES = ["electronics", "home_goods", "apparel_accessories", "food_beverages", "beauty_skincare"] as const;

const LINE_LENGTHS: Record<string, number> = {
  week: 7,
  month: 30,
  year: 12,
};

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

@Injectable()
export class HomeReportService {
  getPie(_by?: string | number) {
    return PIE_CODES.map((code) => ({
      code,
      value: rand(100, 5000),
    }));
  }

  getLine(range: string) {
    const len = LINE_LENGTHS[range] ?? 7;
    return Array.from({ length: len }, () => String(rand(500, 10000)));
  }
}

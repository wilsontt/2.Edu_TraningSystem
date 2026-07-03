import clsx from 'clsx';
import { motion } from 'framer-motion';

interface PassFailStampProps {
  isPassed: boolean;
  /** framer-motion 延遲秒數，預設分數動畫後出現 */
  delay?: number;
  className?: string;
}

/**
 * 通過／未通過雙框印章，與成績預覽 ScoreCardPreview 樣式一致。
 */
const PassFailStamp = ({ isPassed, delay = 1, className }: PassFailStampProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ delay, duration: 0.4, ease: 'easeOut' }}
    className={clsx('pointer-events-none flex justify-center', className)}
  >
    <div
      className={clsx(
        'border-4 border-double px-6 py-2 rounded-lg flex flex-col items-center justify-center bg-white/90',
        isPassed ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600',
      )}
      style={{ minWidth: 'min(180px, 100%)' }}
    >
      <div className="text-xs font-bold uppercase tracking-widest opacity-70 mb-0">Result</div>
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold">{isPassed ? '通過' : '未通過'}</span>
        <span className="text-3xl font-black tracking-widest font-sans">
          {isPassed ? 'PASS' : 'FAIL'}
        </span>
      </div>
    </div>
  </motion.div>
);

export default PassFailStamp;

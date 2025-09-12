import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { useTranslations } from "@/components/translations-context"
import { Message } from "@/types"

interface TokenUsageDisplayProps {
  messages: Message[]
}

export function TokenUsageDisplay({ messages }: TokenUsageDisplayProps) {
  const { t } = useTranslations();

  // Get the latest response with usage data
  const latestUsage = messages
    .filter((msg) => msg.type === 'response.done' && msg.response?.usage)
    .slice(-1)[0];

  // Calculate total usage across all messages
  const totalUsage = messages
    .filter((msg) => msg.response?.usage)
    .reduce((acc, msg) => {
      const usage = msg.response?.usage;
      return {
        total_tokens: (acc.total_tokens || 0) + (usage?.total_tokens || 0),
        input_tokens: (acc.input_tokens || 0) + (usage?.input_tokens || 0),
        output_tokens: (acc.output_tokens || 0) + (usage?.output_tokens || 0),
      };
    }, { total_tokens: 0, input_tokens: 0, output_tokens: 0 });

  if (!latestUsage && totalUsage.total_tokens === 0) {
    return (
      <div className="p-4 bg-muted/20 rounded-lg border border-dashed">
        <div className="text-center text-muted-foreground">
          <div className="text-2xl mb-2">📊</div>
          <p className="text-sm">Chưa có dữ liệu token</p>
          <p className="text-xs mt-1">Token sẽ hiển thị sau khi có phản hồi từ AI</p>
        </div>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible key="token-usage" className="w-full">
      <AccordionItem value="token-usage">
        <AccordionTrigger>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{t('tokenUsage.usage')}</span>
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {totalUsage.total_tokens} total
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <Card>
            <CardContent className="pt-4">
              {/* Latest Usage */}
              {latestUsage && (
                <div className="mb-4">
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Phản hồi gần nhất:</h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-blue-600">{latestUsage.response?.usage?.total_tokens || 0}</div>
                      <div className="text-xs text-blue-600">Tổng</div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-green-600">{latestUsage.response?.usage?.input_tokens || 0}</div>
                      <div className="text-xs text-green-600">Đầu vào</div>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-orange-600">{latestUsage.response?.usage?.output_tokens || 0}</div>
                      <div className="text-xs text-orange-600">Đầu ra</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Total Usage */}
              <div>
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">Tổng cộng phiên:</h4>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">🔢 {t('tokenUsage.total')}</TableCell>
                      <TableCell className="text-right font-bold">{totalUsage.total_tokens}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">📥 {t('tokenUsage.input')}</TableCell>
                      <TableCell className="text-right">{totalUsage.input_tokens}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">📤 {t('tokenUsage.output')}</TableCell>
                      <TableCell className="text-right">{totalUsage.output_tokens}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
} 
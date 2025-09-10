"use client";

import React, { useState, useEffect } from 'react';
import { logger, LogEntry, LogLevel } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Download, Settings } from 'lucide-react';

interface LoggerPanelProps {
  className?: string;
}

export default function LoggerPanel({ className }: LoggerPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [filterLevel, setFilterLevel] = useState<LogLevel>(LogLevel.DEBUG);

  useEffect(() => {
    // Load initial logs
    setLogs(logger.getLogs());

    // Subscribe to log changes
    const unsubscribe = logger.subscribe((newLogs) => {
      setLogs(newLogs);
    });

    return unsubscribe;
  }, []);

  const filteredLogs = logs.filter(log => log.level >= filterLevel);

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case LogLevel.DEBUG: return 'bg-gray-500';
      case LogLevel.INFO: return 'bg-blue-500';
      case LogLevel.WARN: return 'bg-yellow-500';
      case LogLevel.ERROR: return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('vi-VN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const exportLogs = () => {
    const logText = logs.map(log =>
      `[${log.timestamp.toISOString()}] [${LogLevel[log.level]}] ${log.source ? `[${log.source}] ` : ''}${log.message}${log.data ? ` ${JSON.stringify(log.data)}` : ''}`
    ).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `voice-call-logs-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!isVisible) {
    return (
      <Button
        onClick={() => setIsVisible(true)}
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-50"
      >
        <Settings className="w-4 h-4 mr-2" />
        Logs
      </Button>
    );
  }

  return (
    <Card className={`fixed bottom-4 right-4 w-96 h-96 z-50 ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Application Logs</CardTitle>
          <div className="flex gap-1">
            <Button
              onClick={exportLogs}
              variant="ghost"
              size="sm"
              title="Export logs"
            >
              <Download className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => logger.clearLogs()}
              variant="ghost"
              size="sm"
              title="Clear logs"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setIsVisible(false)}
              variant="ghost"
              size="sm"
            >
              ✕
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Level:</span>
          <Select
            value={filterLevel.toString()}
            onValueChange={(value) => setFilterLevel(parseInt(value) as LogLevel)}
          >
            <SelectTrigger className="w-24 h-6 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LogLevel.DEBUG.toString()}>DEBUG</SelectItem>
              <SelectItem value={LogLevel.INFO.toString()}>INFO</SelectItem>
              <SelectItem value={LogLevel.WARN.toString()}>WARN</SelectItem>
              <SelectItem value={LogLevel.ERROR.toString()}>ERROR</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="h-64">
          <div className="space-y-1">
            {filteredLogs.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-4">
                No logs available
              </div>
            ) : (
              filteredLogs.slice(-50).map((log) => (
                <div
                  key={log.id}
                  className="text-xs p-2 rounded bg-muted/50 border-l-2"
                  style={{ borderLeftColor: getLevelColor(log.level).replace('bg-', '') }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="secondary"
                      className={`text-xs px-1 py-0 ${getLevelColor(log.level)} text-white`}
                    >
                      {LogLevel[log.level]}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatTimestamp(log.timestamp)}
                    </span>
                    {log.source && (
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {log.source}
                      </Badge>
                    )}
                  </div>
                  <div className="text-foreground break-words">
                    {log.message}
                  </div>
                  {log.data && (
                    <div className="text-muted-foreground mt-1 break-words">
                      {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
